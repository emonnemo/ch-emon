from fastapi.testclient import TestClient

from app.main import app
from tests.conftest import temp_authenticated_user


def test_auth_login_preferences_and_isolation():
    client = TestClient(app)

    # Unauthenticated request is rejected
    assert client.get("/api/documents").status_code == 401

    with (
        temp_authenticated_user(client, name="Alice") as alice,
        temp_authenticated_user(client, name="Bob") as bob,
    ):
        # Login roundtrip
        login_resp = client.post(
            "/api/auth/login",
            json={"email": alice["email"], "password": alice["password"]},
        )
        assert login_resp.status_code == 200
        assert login_resp.json()["user"]["name"] == "Alice"

        # Wrong password rejected
        bad_login = client.post(
            "/api/auth/login",
            json={"email": alice["email"], "password": "wrong-password"},
        )
        assert bad_login.status_code == 401

        # Preferences sync
        pref_resp = client.patch(
            "/api/auth/preferences",
            json={"preferences": {"show_pinyin": False, "font_size_idx": 2}},
            headers=alice["headers"],
        )
        assert pref_resp.status_code == 200
        assert pref_resp.json()["preferences"]["show_pinyin"] is False
        assert pref_resp.json()["preferences"]["font_size_idx"] == 2

        # User isolation: Alice's document is invisible to Bob
        doc_resp = client.post(
            "/api/documents/text",
            json={"title": "Alice Private", "text": "我喜欢吃冰淇淋。"},
            headers=alice["headers"],
        )
        assert doc_resp.status_code == 201
        doc_id = doc_resp.json()["id"]

        assert client.get(f"/api/documents/{doc_id}", headers=bob["headers"]).status_code == 404


def test_vocab_and_fsrs_review_flow():
    client = TestClient(app)

    with temp_authenticated_user(client, name="Learner") as user_ctx:
        headers = user_ctx["headers"]

        # 1. Add words to custom dictionary (with source sentence + auto-translation)
        v1 = client.post(
            "/api/vocab",
            json={
                "word": "冰淇淋",
                "pinyin": "bīng qí lín",
                "meaning": "ice cream",
                "notes": "Common summer treat",
                "example_sentence": "下午我们买了两个冰淇淋，味道真不错！",
            },
            headers=headers,
        )
        assert v1.status_code == 201
        v1_id = v1.json()["id"]
        assert v1.json()["state"] == "new"
        assert v1.json()["example_sentence"] == "下午我们买了两个冰淇淋，味道真不错！"
        assert v1.json()["example_translation"]

        # Full-sentence translation endpoint + cache hit check
        t1 = client.post(
            "/api/translate",
            json={"text": "今天天气非常暖和。"},
            headers=headers,
        )
        assert t1.status_code == 200
        assert len(t1.json()["translated_text"]) > 3
        t2 = client.post(
            "/api/translate",
            json={"text": "(5) 今天天气[1]非常暖和[2]。"},
            headers=headers,
        )
        assert t2.status_code == 200
        assert t2.json()["cached"] is True
        assert "[1]" not in t2.json()["translated_text"]
        assert "(5)" not in t2.json()["translated_text"]

        # Duplicate word prevented
        dup = client.post(
            "/api/vocab",
            json={"word": "冰淇淋", "pinyin": "bīng qí lín", "meaning": "ice cream"},
            headers=headers,
        )
        assert dup.status_code == 409

        v2 = client.post(
            "/api/vocab",
            json={"word": "图书馆", "pinyin": "tú shū guǎn", "meaning": "library"},
            headers=headers,
        )
        assert v2.status_code == 201
        v2_id = v2.json()["id"]

        # Search & edit vocab
        search = client.get("/api/vocab", params={"q": "ice cream"}, headers=headers)
        assert search.status_code == 200
        assert len(search.json()) == 1
        assert search.json()[0]["word"] == "冰淇淋"

        edited = client.patch(
            f"/api/vocab/{v1_id}",
            json={"notes": "Also written 冰激凌"},
            headers=headers,
        )
        assert edited.status_code == 200
        assert edited.json()["notes"] == "Also written 冰激凌"

        # Saved word refs for reader highlighting
        refs = client.get("/api/vocab/words", headers=headers)
        assert refs.status_code == 200
        assert {r["word"] for r in refs.json()} == {"冰淇淋", "图书馆"}

        # 2. Fetch due reviews with FSRS interval previews
        due = client.get("/api/reviews/due", headers=headers)
        assert due.status_code == 200
        due_cards = due.json()
        assert len(due_cards) == 2
        assert set(due_cards[0]["interval_previews"].keys()) == {"1", "2", "3", "4"}

        # 3. Rate v1 as Easy (4) -> moves out of due queue into Review state
        rev1 = client.post(f"/api/reviews/{v1_id}", json={"rating": 4}, headers=headers)
        assert rev1.status_code == 200
        assert rev1.json()["vocab"]["reps"] == 1
        assert rev1.json()["vocab"]["state"] == "review"

        # Rate v2 as Good (3) -> moves to Learning state (due in ~10m)
        rev2 = client.post(f"/api/reviews/{v2_id}", json={"rating": 3}, headers=headers)
        assert rev2.status_code == 200
        assert rev2.json()["vocab"]["reps"] == 1

        # Stats reflect 2 reviewed today & 0 due immediately
        stats = client.get("/api/reviews/stats", headers=headers)
        assert stats.status_code == 200
        s = stats.json()
        assert s["total_vocab"] == 2
        assert s["reviewed_today"] == 2
        assert s["due_now"] == 0

        # Delete word
        assert client.delete(f"/api/vocab/{v2_id}", headers=headers).status_code == 204
