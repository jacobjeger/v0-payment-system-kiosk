#!/bin/bash

# PDCA Kiosk App Static Export Build Script
# Builds the kiosk app as a standalone static site for Android WebView
# CRITICAL: This script FAILS if the export does not succeed

set -e

echo "================================"
echo "PDCA Kiosk App Builder"
echo "================================"

# Clean output directory
echo "Cleaning previous build..."
rm -rf kiosk-build
mkdir -p kiosk-build

# Set environment variable to enable static export
export KIOSK_BUILD=true

# Run Next.js static export
echo "Building Next.js app..."
npm run build

# Verify that export succeeded - check for required directories
if [ ! -d ".next" ]; then
  echo "ERROR: .next directory not found - build failed"
  exit 1
fi

# Copy the exported static files from .next
echo "Copying static assets..."
if [ -d ".next/static" ]; then
  cp -r .next/static kiosk-build/
  echo "✓ Copied static assets"
else
  echo "ERROR: .next/static not found - export failed"
  exit 1
fi

# Verify that Next.js actually exported to 'out' directory
# The 'output: export' config should create an 'out' folder
if [ ! -d "out" ]; then
  echo "ERROR: out/ directory not found - Next.js export did not complete"
  echo "This means 'output: export' is not configured in next.config.mjs"
  echo "Verify next.config.mjs has: output: process.env.KIOSK_BUILD === 'true' ? 'export' : undefined"
  exit 1
fi

echo "Copying exported app..."
cp -r out/* kiosk-build/
echo "✓ Copied exported app"

# Copy kiosk-app page as index.html
# This file MUST exist after the export
if [ -f "out/kiosk-app/page.html" ]; then
  cp out/kiosk-app/page.html kiosk-build/index.html
  echo "✓ Created index.html from kiosk-app page"
elif [ -f "kiosk-build/kiosk-app/page.html" ]; then
  cp kiosk-build/kiosk-app/page.html kiosk-build/index.html
  echo "✓ Created index.html from kiosk-app page"
else
  echo "ERROR: kiosk-app page.html not found in export"
  echo "Expected: out/kiosk-app/page.html"
  echo "Export directory structure:"
  ls -la out/ || echo "out/ directory is empty"
  exit 1
fi

# Verify index.html exists and is not empty
if [ ! -f "kiosk-build/index.html" ] || [ ! -s "kiosk-build/index.html" ]; then
  echo "ERROR: index.html not created or is empty"
  exit 1
fi

# Verify the HTML contains actual React content, not a placeholder
if ! grep -q "React\|__next\|useState\|useEffect" kiosk-build/index.html; then
  echo "WARNING: index.html may not contain expected React code"
  echo "Contents of index.html:"
  head -20 kiosk-build/index.html
  exit 1
fi

# CRITICAL: Rewrite absolute paths to relative paths for file:// URLs in Android WebView
echo "Rewriting absolute paths to relative paths for offline use..."
sed -i.bak 's|src="/_next/|src="./_next/|g' kiosk-build/index.html
sed -i.bak 's|href="/_next/|href="./_next/|g' kiosk-build/index.html
sed -i.bak 's|src="/assets/|src="./assets/|g' kiosk-build/index.html
sed -i.bak 's|href="/assets/|href="./assets/|g' kiosk-build/index.html
rm -f kiosk-build/index.html.bak
echo "✓ Rewritten paths to relative format"

# CRITICAL: Validate that NO absolute paths remain
echo "Validating absolute paths have been removed..."
if grep -q '="/_next/' kiosk-build/index.html; then
  echo "ERROR: Found absolute /_next/ paths in index.html after rewriting"
  echo "Sample of problematic lines:"
  grep '="/_next/' kiosk-build/index.html | head -5
  exit 1
fi

if grep -q '="/assets/' kiosk-build/index.html; then
  echo "ERROR: Found absolute /assets/ paths in index.html after rewriting"
  echo "Sample of problematic lines:"
  grep '="/assets/' kiosk-build/index.html | head -5
  exit 1
fi
echo "✓ Verified: No absolute paths found"


# Copy config file for reference
if [ -f "kiosk-build.config.json" ]; then
  cp kiosk-build.config.json kiosk-build/
  echo "✓ Copied config"
fi

# Create a build manifest with timestamp
BUILD_TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)
cat > kiosk-build/BUILD_MANIFEST.json << EOF
{
  "name": "PDCA Kiosk",
  "version": "1.0.0",
  "built_at": "$BUILD_TIMESTAMP",
  "description": "Offline transaction kiosk for PDCA payment system",
  "export_method": "Next.js static export (output: export)",
  "entry_point": "index.html",
  "required_files": [
    "index.html",
    "_next/static/chunks/main.js",
    "_next/static/chunks/pages/_app.js"
  ]
}
EOF

echo ""
echo "================================"
echo "Build Complete!"
echo "================================"
echo ""
echo "Output directory: ./kiosk-build/"
echo "Build timestamp: $BUILD_TIMESTAMP"
echo ""
echo "Files created:"
ls -lh kiosk-build/ | tail -n +2 | awk '{print "  " $9 " (" $5 ")"}'
echo ""

# Verify minimum required files exist
REQUIRED_FILES=(
  "index.html"
  "_next/static"
)

echo "Verifying required files..."
for file in "${REQUIRED_FILES[@]}"; do
  if [ ! -e "kiosk-build/$file" ]; then
    echo "ERROR: Required file missing: $file"
    exit 1
  fi
done
echo "✓ All required files present"

echo ""
echo "To use with Android:"
echo "  1. Copy the kiosk-build folder to your Android project"
echo "  2. Place files in: app/src/main/assets/kiosk-app/"
echo "  3. Load in WebView using: file:///android_asset/kiosk-app/index.html"
echo ""
