# Перед сборкой пересобирает src/assets.h из assets/sprites (tools/build_firmware_assets.py).
Import("env")
env.Execute('"$PYTHONEXE" "$PROJECT_DIR/../tools/build_firmware_assets.py"')
