// Previene finestra console aggiuntiva su Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    mymedicalflow_lib::run();
}
