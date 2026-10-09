fn main() {
    tauri_build::try_build(
        tauri_build::Attributes::new().app_manifest(
            tauri_build::AppManifest::new().commands(&["key_set", "key_has", "key_remove", "provider_fetch"]),
        ),
    )
    .expect("failed to run tauri-build");
}
