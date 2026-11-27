from fastapi.testclient import TestClient

from app.core.database import SessionLocal
from app.main import app
from app.services.nlp import annotator
from app.services.pinyin_utils import numbered_to_toned_pinyin
from tests.conftest import temp_authenticated_user


def test_pinyin_tone_conversion():
    assert numbered_to_toned_pinyin("bing1 ji1 ling2") == "bīng jī líng"
    assert numbered_to_toned_pinyin("lu:4 cha2") == "lǜ chá"
    assert numbered_to_toned_pinyin("xi3 huan5") == "xǐ huan"
    assert numbered_to_toned_pinyin("hao3") == "hǎo"
    assert numbered_to_toned_pinyin("liu2") == "liú"
    assert numbered_to_toned_pinyin("dui4") == "duì"


def test_segmentation_and_polyphones():
    with SessionLocal() as db:
        annotator.ensure_loaded(db)

    # 1. Multi-character compound grouping: both 冰淇淋 (bīng qí lín) and 冰激凌 (bīng jī líng)
    tokens = annotator.annotate_paragraph("我非常喜欢吃冰淇淋，也喜欢冰激凌。")
    words = [tok["t"] for tok in tokens]
    assert "冰淇淋" in words
    assert "冰激凌" in words
    ice_cream_1 = next(tok for tok in tokens if tok["t"] == "冰淇淋")
    assert ice_cream_1["p"] == "bīng qí lín"
    assert len(ice_cream_1["d"]) >= 1
    ice_cream_2 = next(tok for tok in tokens if tok["t"] == "冰激凌")
    assert ice_cream_2["p"] == "bīng jī líng"
    assert len(ice_cream_2["d"]) >= 1

    # 2. Polyphone check: 银行 (yín háng) vs 行走 (xíng zǒu)
    bank_tokens = annotator.annotate_paragraph("我去银行取钱。")
    bank = next(tok for tok in bank_tokens if tok["t"] == "银行")
    assert bank["p"].lower() == "yín háng"

    walk_tokens = annotator.annotate_paragraph("他在大街上行走。")
    walk = next(tok for tok in walk_tokens if tok["t"] == "行走")
    assert walk["p"].lower() == "xíng zǒu"

    # 3. Polyphone check: 长大 (zhǎng dà) vs 长度 (cháng dù)
    grow_tokens = annotator.annotate_paragraph("孩子已经长大了。")
    grow = next(tok for tok in grow_tokens if tok["t"] == "长大")
    assert grow["p"].lower() == "zhǎng dà"

    length_tokens = annotator.annotate_paragraph("这条河的长度很长。")
    length = next(tok for tok in length_tokens if tok["t"] == "长度")
    assert length["p"].lower() == "cháng dù"

    # 4. Dictionary-backed sub-segmentation: jieba phrases not in CC-CEDICT should split cleanly
    weather_tokens = annotator.annotate_paragraph("今天天气真不错，我们在街角聊着。")
    weather_words = [tok["t"] for tok in weather_tokens]
    assert "今天天气" not in weather_words
    assert "今天" in weather_words and "天气" in weather_words
    assert "真" in weather_words and "不错" in weather_words
    assert "聊" in weather_words and "着" in weather_words


def test_document_api_roundtrip():
    client = TestClient(app)

    health = client.get("/api/health")
    assert health.status_code == 200
    assert health.json()["dictionary_entries"] > 100_000

    with temp_authenticated_user(client) as auth_ctx:
        headers = auth_ctx["headers"]
        sample_text = "今天天气很好，我和朋友去图书馆看书。\n\n下午我们买了两个冰淇淋，味道真不错！"
        create_resp = client.post(
            "/api/documents/text",
            json={"title": "Pytest Sample", "text": sample_text},
            headers=headers,
        )
        assert create_resp.status_code == 201
        doc = create_resp.json()
        doc_id = doc["id"]
        assert doc["section_count"] == 1
        assert doc["total_chars"] > 20

        sec_resp = client.get(f"/api/documents/{doc_id}/sections/0", headers=headers)
        assert sec_resp.status_code == 200
        sec = sec_resp.json()
        assert len(sec["tokens"]) == 2  # 2 paragraphs preserved

        all_tokens = [tok for para in sec["tokens"] for tok in para]
        ice_cream = next(tok for tok in all_tokens if tok["t"] == "冰淇淋")
        entry_id = str(ice_cream["d"][0])
        assert entry_id in sec["dictionary"]
        assert any("ice cream" in d.lower() for d in sec["dictionary"][entry_id]["definitions"])

        # Direct dictionary lookup
        lookup_resp = client.get("/api/dictionary/lookup", params={"word": "冰淇淋"})
        assert lookup_resp.status_code == 200
        assert any("ice cream" in d.lower() for d in lookup_resp.json()[0]["definitions"])

        del_resp = client.delete(f"/api/documents/{doc_id}", headers=headers)
        assert del_resp.status_code == 204
