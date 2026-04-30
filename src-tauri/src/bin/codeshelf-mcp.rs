#[tokio::main]
async fn main() {
    if let Err(err) = codeshelf_lib::mcp_gateway::run_cli().await {
        eprintln!("{}", err);
        std::process::exit(1);
    }
}
