use std::{
    fs::OpenOptions,
    io::{self, Write},
    path::{Path, PathBuf},
};

use tauri::{
    AppHandle, Manager, Runtime,
    plugin::{Builder, TauriPlugin},
};

const ALLOWED_EXTENSIONS: [&str; 1] = ["csv"];
const MAX_BYTES: usize = 5 * 1024 * 1024;
const MAX_ATTEMPTS: u32 = 100;

fn validated_name(name: &str) -> Result<(&str, &str), String> {
    let path = Path::new(name);
    let is_plain =
        path.file_name().and_then(|value| value.to_str()) == Some(name) && !name.starts_with('.');
    let stem = path.file_stem().and_then(|value| value.to_str());
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .filter(|value| ALLOWED_EXTENSIONS.contains(value));
    match (is_plain, stem, extension) {
        (true, Some(stem), Some(extension)) => Ok((stem, extension)),
        _ => Err("invalid_file_name".into()),
    }
}

fn write_new(
    directory: &Path,
    stem: &str,
    extension: &str,
    contents: &[u8],
) -> io::Result<PathBuf> {
    for attempt in 0..MAX_ATTEMPTS {
        let name = if attempt == 0 {
            format!("{stem}.{extension}")
        } else {
            format!("{stem} ({attempt}).{extension}")
        };
        let candidate = directory.join(name);
        match OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&candidate)
        {
            Ok(mut file) => {
                file.write_all(contents)?;
                return Ok(candidate);
            }
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(error),
        }
    }
    Err(io::Error::new(
        io::ErrorKind::AlreadyExists,
        "no free file name",
    ))
}

#[tauri::command]
async fn save_export<R: Runtime>(
    app: AppHandle<R>,
    file_name: String,
    contents: String,
) -> Result<String, String> {
    let (stem, extension) = validated_name(&file_name)?;
    if contents.len() > MAX_BYTES {
        return Err("file_too_large".into());
    }
    let directory = app
        .path()
        .download_dir()
        .map_err(|error| error.to_string())?;
    let path = write_new(&directory, stem, extension, contents.as_bytes())
        .map_err(|error| error.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("exports")
        .invoke_handler(tauri::generate_handler![save_export])
        .build()
}

#[cfg(test)]
mod tests {
    use super::validated_name;

    #[test]
    fn accepts_plain_csv_names() {
        assert_eq!(
            validated_name("solvia-trends.csv"),
            Ok(("solvia-trends", "csv"))
        );
    }

    #[test]
    fn rejects_paths_hidden_files_and_other_extensions() {
        for name in [
            "../trends.csv",
            "folder/trends.csv",
            ".csv",
            "trends.txt",
            "trends",
        ] {
            assert!(validated_name(name).is_err(), "{name}");
        }
    }
}
