import os
import json

def generate_config():
    # Paths are relative to the script's directory
    script_dir = os.path.dirname(os.path.abspath(__file__))
    images_dir = os.path.abspath(os.path.join(script_dir, "images"))
    config_file_path = os.path.join(script_dir, "config.js")

    if not os.path.exists(images_dir):
        print(f"Error: Images directory '{images_dir}' not found.")
        return

    allowed_extensions = {".png", ".jpg", ".jpeg", ".webp", ".gif"}
    image_items = []

    # 1. Scan root of images/ folder
    for entry in os.scandir(images_dir):
        if entry.is_file() and os.path.splitext(entry.name)[1].lower() in allowed_extensions:
            size_mb = entry.stat().st_size / (1024 * 1024)
            size_str = f"{size_mb:.2f} MB"
            image_items.append({
                "filename": entry.name,
                "size": size_str
            })

    # 2. Scan 1-level subdirectories inside images/ folder
    for entry in os.scandir(images_dir):
        if entry.is_dir():
            subfolder_name = entry.name
            # Prevent scanning system or hidden folders
            if subfolder_name.startswith('.'):
                continue
            for subentry in os.scandir(entry.path):
                if subentry.is_file() and os.path.splitext(subentry.name)[1].lower() in allowed_extensions:
                    size_mb = subentry.stat().st_size / (1024 * 1024)
                    size_str = f"{size_mb:.2f} MB"
                    relative_filename = f"{subfolder_name}/{subentry.name}"
                    image_items.append({
                        "filename": relative_filename,
                        "size": size_str
                    })

    # Helper function to check if a relative path starts with "__" or contains "/__"
    def starts_with_double_underscore(filename):
        base = os.path.basename(filename)
        return base.startswith("__")

    # Sort images: alphabetical by filename, but files starting with "__" go to the very top
    def sort_key(item):
        fname = item["filename"]
        is_starred = starts_with_double_underscore(fname)
        return (not is_starred, fname.lower())

    image_items.sort(key=sort_key)

    # Determine default start image:
    # First image in the sorted list starting with "__", or empty if none exist
    starred_images = [img["filename"] for img in image_items if starts_with_double_underscore(img["filename"])]
    
    if starred_images:
        default_image = starred_images[0]
    else:
        # If no image starts with "__", set defaultImage to empty string to trigger Welcome screen
        default_image = ""

    # Generate config.js contents
    config_js_content = f"""// Showcase Application Configuration
// Generated dynamically by generate_config.py
// Do not modify directly if using the python generator script.

window.SHOWCASE_CONFIG = {{
  // Filename of the default image loaded on the home screen
  defaultImage: "{default_image}",

  // List of images to display in the showcase sidebar/navigation
  images: {json.dumps(image_items, indent=4)}
}};
"""

    with open(config_file_path, "w", encoding="utf-8") as f:
        f.write(config_js_content)

    print(f"Successfully generated config.js with {len(image_items)} images.")
    if default_image:
        try:
            print(f"Default start image set to: '{default_image}'")
        except UnicodeEncodeError:
            print("Default start image set successfully.")
    else:
        print("No start image starting with '__' found. Default image set to Welcome Screen.")

if __name__ == "__main__":
    generate_config()
