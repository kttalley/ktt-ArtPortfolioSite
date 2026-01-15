#!/bin/bash
# Setup script for Instagram sync service

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"

echo "Setting up Instagram sync service..."
echo "Project root: $PROJECT_ROOT"

# Create virtual environment
echo "Creating Python virtual environment..."
python3 -m venv "$SCRIPT_DIR/venv"
source "$SCRIPT_DIR/venv/bin/activate"

# Install dependencies
echo "Installing dependencies..."
pip install -r "$SCRIPT_DIR/requirements.txt"

# Create public directory
echo "Creating public/instagram directory..."
mkdir -p "$PROJECT_ROOT/public/instagram"

# Create initial empty JS file if it doesn't exist
if [ ! -f "$PROJECT_ROOT/src/data/instagramImages.js" ]; then
    echo "Creating placeholder instagramImages.js..."
    cat > "$PROJECT_ROOT/src/data/instagramImages.js" << 'EOF'
// Auto-generated Instagram images list
// Run scripts/instagram_sync/sync_instagram.py to populate
const instagramImages = [];

export default instagramImages;
EOF
fi

echo ""
echo "Setup complete!"
echo ""
echo "To sync Instagram posts:"
echo "  cd $SCRIPT_DIR"
echo "  source venv/bin/activate"
echo "  python sync_instagram.py"
echo ""
echo "To set up weekly cron job:"
echo "  crontab -e"
echo "  # Add: 0 3 * * 0 cd $SCRIPT_DIR && ./venv/bin/python sync_instagram.py >> /var/log/instagram-sync.log 2>&1"
