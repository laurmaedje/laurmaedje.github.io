use std::io::Read;

fn main() {
    let mut buf = vec![];
    let mut stdin = std::io::stdin().lock();
    stdin.read_to_end(&mut buf).unwrap();

    let text = String::from_utf8(buf).unwrap();
    let root = typst_syntax::parse(&text);
    let html = typst_syntax::highlight_html(&root);
    print!("{html}");
}
