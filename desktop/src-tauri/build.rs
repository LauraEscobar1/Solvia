fn main() {
    tauri_build::try_build(
        tauri_build::Attributes::new().plugin(
            "secure-store",
            tauri_build::InlinedPlugin::new()
                .commands(&[
                    "save_refresh_token",
                    "load_refresh_token",
                    "clear_refresh_token",
                ])
                .default_permission(tauri_build::DefaultPermissionRule::AllowAllCommands),
        ),
    )
    .expect("failed to run tauri-build");
}
