use std::path::{Path, PathBuf};

fn main() {
    // The .exe's icon is compiled into a Windows resource by tauri-build,
    // which Cargo only re-runs when it thinks something changed. Without
    // these, replacing the icons leaves the old one baked into the build.
    println!("cargo:rerun-if-changed=icons");
    println!("cargo:rerun-if-changed=tauri.conf.json");
    println!("cargo:rerun-if-changed=mcp-manifest.json");
    ai_kit();
    tauri_build::build()
}

/// The docs written next to the installed exe for AI agents (kit.rs): a
/// list of (path in the install folder, the file's bytes).
fn ai_kit() {
    let root = PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").unwrap()).join("..");
    let docs = root.join("docs");
    let mut files: Vec<(String, PathBuf)> = vec![
        ("AGENTS.md".into(), docs.join("ai/installed/AGENTS.md")),
        ("skills/arayashiki/SKILL.md".into(), docs.join("ai/installed/SKILL.md")),
        ("docs/jjs-skill-builder.md".into(), docs.join("jjs-skill-builder.md")),
        ("docs/USER-MANUAL.md".into(), docs.join("USER-MANUAL.md")),
        ("docs/ai-guide.md".into(), docs.join("ai/README.md")),
        ("docs/PLUGINS.md".into(), docs.join("PLUGINS.md")),
        ("docs/plugins/example/plugin.json".into(), docs.join("plugins/example/plugin.json")),
        ("docs/plugins/example/main.js".into(), docs.join("plugins/example/main.js")),
    ];
    for dir in ["jjs-library", "jjs-game"] {
        let mut names: Vec<_> = std::fs::read_dir(docs.join(dir))
            .map(|r| r.flatten().map(|e| e.path()).filter(|p| p.is_file()).collect())
            .unwrap_or_default();
        names.sort();
        for p in names {
            let name = p.file_name().unwrap().to_string_lossy().to_string();
            files.push((format!("docs/{dir}/{name}"), p));
        }
        println!("cargo:rerun-if-changed={}", docs.join(dir).display());
    }
    let mut out = String::from("pub const KIT: &[(&str, &[u8])] = &[\n");
    for (name, path) in &files {
        println!("cargo:rerun-if-changed={}", path.display());
        // Some are kept out of git (docs/ai/README.md): a copy without them ships without them.
        let Ok(abs) = std::fs::canonicalize(path) else { continue };
        out.push_str(&format!("    ({name:?}, include_bytes!({:?})),\n", strip_unc(&abs)));
    }
    out.push_str("];\n");
    let dest = Path::new(&std::env::var("OUT_DIR").unwrap()).join("kit.rs");
    std::fs::write(dest, out).unwrap();
}

fn strip_unc(p: &Path) -> String {
    let s = p.to_string_lossy().to_string();
    s.strip_prefix(r"\\?\").map(str::to_string).unwrap_or(s)
}
