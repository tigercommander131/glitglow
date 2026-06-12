#!/bin/sh
# Deploy the app to the preview folder (what the Launch panel serves).
cd "$(dirname "$0")"
rsync -a --delete --exclude ".claude" --exclude ".git" --exclude ".DS_Store" \
  index.html css js "../Current Builds/"
echo "Deployed to Current Builds."
