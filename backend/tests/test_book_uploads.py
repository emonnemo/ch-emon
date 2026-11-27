import io
import os
import tempfile

import fitz
from ebooklib import epub
from fastapi.testclient import TestClient

from app.main import app
from tests.conftest import temp_authenticated_user


def _build_chinese_pdf_bytes() -> bytes:
    doc = fitz.open()
    page1 = doc.new_page()
    # Use PyMuPDF built-in Simplified Chinese font ('china-s') with hard line wrap + page number
    page1.insert_text(
        (72, 72),
        "今天天气非常暖和，\n我和好朋友一起去图书馆看书。",
        fontname="china-s",
        fontsize=14,
    )
    page1.insert_text((280, 780), "1", fontname="helv", fontsize=10)

    page2 = doc.new_page()
    page2.insert_text(
        (72, 72),
        "下午我们买了两个冰淇淋，味道真不错！",
        fontname="china-s",
        fontsize=14,
    )
    page2.insert_text((280, 780), "2", fontname="helv", fontsize=10)

    pdf_bytes = doc.tobytes()
    doc.close()
    return pdf_bytes


def _build_blank_pdf_bytes() -> bytes:
    doc = fitz.open()
    doc.new_page()
    pdf_bytes = doc.tobytes()
    doc.close()
    return pdf_bytes


def _build_chinese_epub_bytes() -> bytes:
    book = epub.EpubBook()
    book.set_identifier("chemon-test-epub-1")
    book.set_title("北京游记")
    book.set_language("zh")

    c1 = epub.EpubHtml(title="第一章 · 出发", file_name="chap_01.xhtml", lang="zh")
    c1.content = (
        "<html><body><h1>第一章 · 出发</h1>"
        "<p>今天天气很好，我们去<ruby>银行<rt>yínháng</rt></ruby>换了一些钱。</p>"
        "</body></html>"
    )

    c2 = epub.EpubHtml(title="第二章 · 冰淇淋", file_name="chap_02.xhtml", lang="zh")
    c2.content = (
        "<html><body><h1>第二章 · 冰淇淋</h1>"
        "<p>下午大家在公园里吃冰淇淋，孩子已经长大了。</p>"
        "</body></html>"
    )

    book.add_item(c1)
    book.add_item(c2)
    book.toc = (
        epub.Link("chap_01.xhtml", "第一章 · 出发", "c1"),
        epub.Link("chap_02.xhtml", "第二章 · 冰淇淋", "c2"),
    )
    book.add_item(epub.EpubNcx())
    book.add_item(epub.EpubNav())
    book.spine = [c1, c2]

    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".epub", delete=False) as tmp:
            tmp_path = tmp.name
        epub.write_epub(tmp_path, book)
        with open(tmp_path, "rb") as fh:
            return fh.read()
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)


def test_pdf_upload_and_rename():
    client = TestClient(app)
    pdf_bytes = _build_chinese_pdf_bytes()

    with temp_authenticated_user(client) as auth_ctx:
        headers = auth_ctx["headers"]
        resp = client.post(
            "/api/documents/upload",
            files={"file": ("summer_story.pdf", io.BytesIO(pdf_bytes), "application/pdf")},
            data={"title": "PDF 测试故事"},
            headers=headers,
        )
        assert resp.status_code == 202
        doc_id = resp.json()["id"]

        detail = client.get(f"/api/documents/{doc_id}", headers=headers)
        assert detail.status_code == 200
        body = detail.json()
        assert body["status"] == "ready"
        assert body["progress_percent"] == 100
        assert body["source_type"] == "pdf"
        assert body["section_count"] >= 1

        sec = client.get(f"/api/documents/{doc_id}/sections/0", headers=headers).json()
        words = [tok["t"] for para in sec["tokens"] for tok in para]
        assert "今天" in words
        assert "天气" in words
        assert "冰淇淋" in words

        renamed = client.patch(
            f"/api/documents/{doc_id}",
            json={"title": "重命名后的PDF"},
            headers=headers,
        )
        assert renamed.status_code == 200
        assert renamed.json()["title"] == "重命名后的PDF"


def test_blank_pdf_fails_gracefully():
    client = TestClient(app)
    pdf_bytes = _build_blank_pdf_bytes()

    with temp_authenticated_user(client) as auth_ctx:
        headers = auth_ctx["headers"]
        resp = client.post(
            "/api/documents/upload",
            files={"file": ("scanned.pdf", io.BytesIO(pdf_bytes), "application/pdf")},
            headers=headers,
        )
        assert resp.status_code == 202
        doc_id = resp.json()["id"]

        detail = client.get(f"/api/documents/{doc_id}", headers=headers).json()
        assert detail["status"] == "failed"
        assert "selectable text" in (detail["error_message"] or "").lower()


def test_epub_upload_preserves_chapters_and_strips_ruby():
    client = TestClient(app)
    epub_bytes = _build_chinese_epub_bytes()

    with temp_authenticated_user(client) as auth_ctx:
        headers = auth_ctx["headers"]
        resp = client.post(
            "/api/documents/upload",
            files={"file": ("beijing.epub", io.BytesIO(epub_bytes), "application/epub+zip")},
            headers=headers,
        )
        assert resp.status_code == 202
        doc_id = resp.json()["id"]

        detail = client.get(f"/api/documents/{doc_id}", headers=headers).json()
        assert detail["status"] == "ready"
        assert detail["source_type"] == "epub"
        assert detail["title"] == "北京游记"
        assert detail["section_count"] == 2
        assert detail["sections"][0]["title"] == "第一章 · 出发"
        assert detail["sections"][1]["title"] == "第二章 · 冰淇淋"

        sec0 = client.get(f"/api/documents/{doc_id}/sections/0", headers=headers).json()
        raw_tokens_0 = [tok["t"] for para in sec0["tokens"] for tok in para]
        assert "银行" in raw_tokens_0
        assert not any("yínháng" in t for t in raw_tokens_0)

        sec1 = client.get(f"/api/documents/{doc_id}/sections/1", headers=headers).json()
        raw_tokens_1 = [tok["t"] for para in sec1["tokens"] for tok in para]
        assert "冰淇淋" in raw_tokens_1
        assert "长大" in raw_tokens_1
