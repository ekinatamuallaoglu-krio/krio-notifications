use directories::ProjectDirs;
use flate2::read::GzDecoder;
use sha2::{Digest, Sha256};
use std::{env, fs, io, net::TcpStream, path::{Path, PathBuf}, process::{Command, Stdio}, thread, time::Duration};

const PAYLOAD: &[u8] = include_bytes!("../payload.tar.gz");
const EXPECTED: &str = include_str!("../payload.sha256");

fn extract(cache: &Path) -> io::Result<()> {
    let actual = format!("{:x}", Sha256::digest(PAYLOAD));
    if actual != EXPECTED.trim() { return Err(io::Error::new(io::ErrorKind::InvalidData, "payload integrity check failed")); }
    let marker = cache.join(".payload-sha256"); if fs::read_to_string(&marker).ok().as_deref() == Some(EXPECTED) { return Ok(()); }
    let temp = cache.with_extension("new"); let _ = fs::remove_dir_all(&temp); fs::create_dir_all(&temp)?;
    tar::Archive::new(GzDecoder::new(PAYLOAD)).unpack(&temp)?; let _ = fs::remove_dir_all(cache); fs::rename(&temp, cache)?; fs::write(marker, EXPECTED)
}
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let dirs = ProjectDirs::from("tr", "Krio", "KrioNotify").ok_or("user directory unavailable")?, version = env!("CARGO_PKG_VERSION");
    let cache: PathBuf = dirs.cache_dir().join(version); extract(&cache)?; fs::create_dir_all(dirs.data_dir())?;
    let port = env::var("PORT").unwrap_or_else(|_| "3000".into()); let app = cache.join("app"); let node = cache.join(if cfg!(windows) { "node.exe" } else { "node" });
    #[cfg(unix)] { use std::os::unix::fs::PermissionsExt; fs::set_permissions(&node, fs::Permissions::from_mode(0o755))?; }
    let mut child = Command::new(node).arg("server.js").current_dir(&app).env("PORT", &port).env("HOSTNAME", "0.0.0.0").env("KRIO_DATA_DIR", dirs.data_dir()).stdin(Stdio::null()).spawn()?;
    let address = format!("127.0.0.1:{port}"); for _ in 0..100 { if TcpStream::connect(&address).is_ok() { let _ = webbrowser::open(&format!("http://{address}")); break; } thread::sleep(Duration::from_millis(100)); }
    std::process::exit(child.wait()?.code().unwrap_or(1));
}
