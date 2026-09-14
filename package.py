import os
import json
import zipfile

def package_extension():
    # Read manifest to get version
    with open('manifest.json', 'r', encoding='utf-8') as f:
        manifest = json.load(f)
    version = manifest.get('version', '1.0.0')

    os.makedirs('release', exist_ok=True)
    zip_filename = f'release/course-hider-v{version}.zip'

    # Files to include in the store release
    include_files = [
        'manifest.json',
        'content.js',
        'popup.html',
        'popup.js',
        'icon.png'
    ]

    include_dirs = [
        'icons'
    ]

    print(f'Creating store release package: {zip_filename}...')
    with zipfile.ZipFile(zip_filename, 'w', zipfile.ZIP_DEFLATED) as zf:
        for f in include_files:
            if os.path.exists(f):
                zf.write(f, arcname=f)
                print(f'  + {f}')
            else:
                print(f'  ! Warning: {f} not found')

        for d in include_dirs:
            if os.path.exists(d):
                for root, _, files in os.walk(d):
                    for file in files:
                        filepath = os.path.join(root, file)
                        arcname = os.path.relpath(filepath, '.')
                        zf.write(filepath, arcname=arcname)
                        print(f'  + {arcname}')

    size_kb = os.path.getsize(zip_filename) / 1024
    print(f'\nSuccess! Package ready for Chrome Web Store and Opera Add-ons.')
    print(f'File: {zip_filename} ({size_kb:.1f} KB)')

if __name__ == '__main__':
    package_extension()
