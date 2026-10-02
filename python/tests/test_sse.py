from naiuz._streaming import SSEDecoder


def test_it_gives_each_event_s_data_joining_its_data_lines_with_a_line_break() -> None:
    assert SSEDecoder().push("data: a\ndata: b\n\ndata: c\n\n") == ["a\nb", "c"]


def test_it_keeps_an_event_open_until_a_blank_line_ends_it() -> None:
    decoder = SSEDecoder()
    assert decoder.push("data: a\n") == []
    assert decoder.push("\n") == ["a"]


def test_a_line_ends_at_crlf_cr_or_lf_even_when_two_pieces_split_a_crlf() -> None:
    decoder = SSEDecoder()
    assert decoder.push("data: a\r") == []
    assert decoder.push("\ndata: b\n\n") == ["a\nb"]
    assert decoder.push("data: c\r\rdata: d\r\n\r\n") == ["c", "d"]


def test_it_skips_comments_and_other_fields_and_takes_data_with_or_without_a_space() -> None:
    assert SSEDecoder().push(": keep-alive\nevent: message\nid: 7\nretry: 1000\ndata:x\ndata\n\n") == ["x\n"]


def test_an_event_the_stream_s_end_cuts_off_is_never_given() -> None:
    assert SSEDecoder().push("data: whole\n\ndata: cut") == ["whole"]
