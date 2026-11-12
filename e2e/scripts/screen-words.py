"""Prints every text and accessibility label in a `maestro hierarchy` dump, one per line,
so a failed run's log shows what the phone was displaying."""
import json
import sys

raw = open(sys.argv[1], encoding='utf-8').read()
tree = json.loads(raw[raw.index('{'):])  # maestro may print a banner before the JSON


def walk(node):
    attrs = node.get('attributes', {})
    for key in ('text', 'accessibilityText', 'resource-id'):
        value = (attrs.get(key) or '').strip()
        if value:
            print(f'  {key}: {value}')
    for child in node.get('children', []):
        walk(child)


walk(tree)
