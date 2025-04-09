#!/usr/bin/env python3
import os
import shutil
import argparse

BLACK_LIST = "venv,lib,bin,.github,.vscode,docs,eval,examples,tests,.git,.env,all_files,assets"

def should_skip_directory(path, blacklist):
    """
    Check if any component in the given path is in the blacklist.
    """
    for part in os.path.normpath(path).split(os.sep):
        if part in blacklist:
            return True
    return False

def flatten_copy(src, dst, blacklist):
    """
    Recursively copy files from src to dst (flattening the folder hierarchy)
    and skip any directories whose names are in the blacklist.
    The new file names are created as: basefolder_subfolder1_subfolder2_..._filename.ext
    """
    if not os.path.exists(dst):
        os.makedirs(dst)
    
    # Get the base folder name of the source.
    base_folder_name = os.path.basename(os.path.normpath(src))
    
    for root, dirs, files in os.walk(src):
        # Skip processing this directory tree if any part of the path is blacklisted.
        if should_skip_directory(root, blacklist):
            # Optionally, if you want to also prune the search within these directories:
            dirs[:] = []  # Prevent walking further down from this folder.
            continue

        for file in files:
            # Determine the relative path of the file from the source directory.
            rel_path = os.path.relpath(root, src)
            
            # Create a flattened part from relative path, replacing directory separators with underscores.
            # If the file is in the root of src, rel_path will be '.', so we ignore that.
            if rel_path == '.':
                rel_flat = ""
            else:
                rel_flat = rel_path.replace(os.sep, "_") + "_"
            
            # Build the new file name.
            new_filename = f"{base_folder_name}_{rel_flat}{file}"
            
            # Form the full source and destination file paths.
            src_file = os.path.join(root, file)
            dst_file = os.path.join(dst, new_filename)
            
            # Copy the file along with metadata.
            shutil.copy2(src_file, dst_file)
            print(f"Copied: {src_file} -> {dst_file}")

def parse_args():
    parser = argparse.ArgumentParser(description="Flatten copy: copy all files from a folder (and its subfolders) to a new folder without subdirectories.")
    parser.add_argument("source", help="The source folder to copy from")
    parser.add_argument("destination", help="The destination folder to copy to")
    parser.add_argument("--blacklist", type=str, default=BLACK_LIST,
                        help="Comma-separated list of directory names to skip (default: 'venv,lib,bin')")
    return parser.parse_args()

def main():
    args = parse_args()
    blacklist = [x.strip() for x in (args.blacklist + BLACK_LIST).split(",") if x.strip()]
    
    # Verify that source folder exists.
    if not os.path.exists(args.source):
        print(f"Source folder '{args.source}' does not exist.")
        return

    print(f"Starting flatten copy from '{args.source}' to '{args.destination}'")
    print(f"Skipping directories in blacklist: {blacklist}")
    flatten_copy(args.source, args.destination, blacklist)
    print("Done!")

if __name__ == "__main__":
    main()

# python flatten_files.py /path/to/source /path/to/destination --blacklist venv,lib,bin
