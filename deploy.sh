#!/bin/sh
# Deploy the app to the preview folder (what the Launch panel serves).
# Asset URLs get a ?v=<timestamp> stamp so the browser's heuristic cache
# (python http.server sends no Cache-Control) can't serve stale js/css.
cd "$(dirname "$0")"
rsync -a --delete --exclude ".claude" --exclude ".git" --exclude ".DS_Store" \
  index.html css js "../Current Builds/"
STAMP=$(date +%s)
sed -i '' \
  -e "s|src=\"js/\([^\"?]*\)\"|src=\"js/\1?v=$STAMP\"|g" \
  -e "s|href=\"css/styles.css\"|href=\"css/styles.css?v=$STAMP\"|" \
  "../Current Builds/index.html"
echo "Deployed to Current Builds (v=$STAMP)."
