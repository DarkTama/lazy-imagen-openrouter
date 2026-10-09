fn main() {
    tauri_build::try_build(
        tauri_build::Attributes::new().app_manifest(
            tauri_build::AppManifest::new().commands(&["key_set", "key_has", "key_remove"]),
        ),
    )
    .expect("failed to run tauri-build");
}
