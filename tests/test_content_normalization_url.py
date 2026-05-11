from backend.services.document_service import normalize_imported_content


def test_url_content_normalization_keeps_source_url_metadata():
    normalized = normalize_imported_content(
        '示例文章',
        '# 示例文章\n\n正文内容',
        source_type='url',
        source_name='https://example.com/post',
        metadata={'url': 'https://example.com/post'},
    )

    assert normalized['source_type'] == 'url'
    assert normalized['metadata']['url'] == 'https://example.com/post'
    assert normalized['blocks'][0]['type'] == 'heading'
