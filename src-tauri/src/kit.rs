// The files an AI agent reads next to the installed exe: AGENTS.md, the
// handbook, the move library, the game data, a skill for Claude, and
// mcp.json (build.rs gathers them from docs/). An AI app given the install
// folder finds what Arayashiki is and how to reach it, not a lone .exe.
// Written once per version, and only in an installed copy's own folder.

use std::path::Path;

include!(concat!(env!("OUT_DIR"), "/kit.rs"));

const STAMP: &str = ".ai-kit-version";

/// Writes the kit next to the exe if this version hasn't yet.
pub fn ensure() {
    let Ok(exe) = std::env::current_exe() else { return };
    let Some(dir) = exe.parent() else { return };
    // An installed copy lives in its own "Arayashiki" folder; a build in
    // target\release, or an exe someone put on their desktop, is left alone.
    if !dir.file_name().map(|n| n.eq_ignore_ascii_case("Arayashiki")).unwrap_or(false) {
        return;
    }
    let version = env!("CARGO_PKG_VERSION");
    if std::fs::read_to_string(dir.join(STAMP)).map(|v| v.trim() == version).unwrap_or(false) && dir.join("mcp.json").exists() {
        return;
    }
    let _ = write(dir, &exe);
    let _ = std::fs::write(dir.join(STAMP), version);
}

fn write(dir: &Path, exe: &Path) -> std::io::Result<()> {
    // Last version's docs go first, so a removed library move doesn't linger.
    let _ = std::fs::remove_dir_all(dir.join("docs"));
    for (name, bytes) in KIT {
        let path = dir.join(name);
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::write(path, bytes)?;
    }
    let mcp = serde_json::json!({ "mcpServers": { "arayashiki": { "command": exe.to_string_lossy(), "args": ["--mcp"] } } });
    std::fs::write(dir.join("mcp.json"), serde_json::to_string_pretty(&mcp).unwrap_or_default())
}
