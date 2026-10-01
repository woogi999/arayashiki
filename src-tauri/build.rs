fn main() {
    // The .exe's icon is compiled into a Windows resource by tauri-build,
    // which Cargo only re-runs when it thinks something changed. Without
    // these, replacing the icons leaves the old one baked into the build.
    println!("cargo:rerun-if-changed=icons");
    println!("cargo:rerun-if-changed=tauri.conf.json");
    tauri_build::build()
}
