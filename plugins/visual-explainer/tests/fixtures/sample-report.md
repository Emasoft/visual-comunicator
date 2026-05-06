# Sample Test Report

A synthetic agent report for the comment-modal test suite. Each
section below contains at least one of every commentable element
type so the test driver can exercise paragraphs, list items, table
rows, and code blocks.

## 1. First finding — paragraph

This is a plain paragraph that the test driver attaches a comment to.
It is intentionally short so the test output is easy to read.

A second paragraph in the same section — useful for testing that
multiple paragraphs in the same finding are independently
commentable and produce distinct comment IDs.

## 2. Second finding — list

The driver opens a thread on one of the items below and posts a
question.

- First list item — short bullet.
- Second list item — slightly longer bullet to ensure word-wrap
  doesn't break the comment-id binding when the list item spans
  multiple lines.
- Third list item — the test driver targets this one specifically.

## 3. Third finding — table

| Column A | Column B | Column C |
|---|---|---|
| Row 1A | Row 1B | Row 1C |
| Row 2A | Row 2B | Row 2C |
| Row 3A | Row 3B | Row 3C |

The driver attaches a comment to one of the table rows above.

## 4. Fourth finding — code

A code block:

```python
def hello(name: str) -> str:
    return f"Hello, {name}!"

print(hello("world"))
```

The driver attaches a comment to the code block.
