import { assert } from "chai";
import {
  renderDialog,
  renderDialogHtml,
  type DialogData,
} from "../src/modules/cleaningDialog";
import { escapeHtml } from "../src/utils/html";
import type { Change } from "../src/modules/changes";

/** Mock getString: returns "key" or "key:arg1=val1,arg2=val2" */
function mockGetString(
  key: string,
  options?: { args?: Record<string, string> },
): string {
  if (!options?.args) return key;
  const argStr = Object.entries(options.args)
    .map(([k, v]) => `${k}=${v}`)
    .join(",");
  return `${key}:${argStr}`;
}

const changes: Change[] = [
  {
    itemLibraryID: 1,
    itemKey: "A1",
    itemTitle: "Paper One",
    field: "author",
    oldValue: "Smith, John; Doe, Jane",
    newValue: "Smith, John and Doe, Jane",
  },
];

describe("cleaningDialog", function () {
  describe("renderDialog", function () {
    it("returns structured data with summary, columns, and rows", function () {
      const data = renderDialog(changes, 3, mockGetString);

      assert.equal(
        data.summary,
        "dialog-summary-clean-items:total=3,changes=1,unchanged=2",
      );
      assert.deepEqual(data.columns, [
        "dialog-column-item",
        "dialog-column-field",
        "dialog-column-change",
      ]);
      assert.lengthOf(data.rows, 1);
      assert.deepEqual(data.rows[0], {
        itemTitle: "Paper One",
        fieldName: "field-author",
        oldValue: "Smith, John; Doe, Jane",
        newValue: "Smith, John and Doe, Jane",
      });
    });

    it("returns empty rows when changes is empty", function () {
      const data = renderDialog([], 5, mockGetString);

      assert.equal(
        data.summary,
        "dialog-summary-clean-items:total=5,changes=0,unchanged=5",
      );
      assert.lengthOf(data.rows, 0);
    });

    it("computes unchanged count correctly for multiple items", function () {
      const multiChanges: Change[] = [
        {
          itemLibraryID: 1,
          itemKey: "A1",
          itemTitle: "Paper One",
          field: "author",
          oldValue: "old",
          newValue: "new",
        },
        {
          itemLibraryID: 1,
          itemKey: "A1",
          itemTitle: "Paper One",
          field: "issue",
          oldValue: "old",
          newValue: "new",
        },
        {
          itemLibraryID: 1,
          itemKey: "A2",
          itemTitle: "Paper Two",
          field: "author",
          oldValue: "old",
          newValue: "new",
        },
      ];
      const data = renderDialog(multiChanges, 5, mockGetString);

      // 2 changed items (A1, A2), 5 total → 3 unchanged
      assert.equal(
        data.summary,
        "dialog-summary-clean-items:total=5,changes=3,unchanged=3",
      );
      assert.lengthOf(data.rows, 3);
    });

    it("returns only display-relevant fields in rows (no itemKey)", function () {
      const data = renderDialog(changes, 1, mockGetString);
      const row = data.rows[0];

      assert.deepEqual(Object.keys(row), [
        "itemTitle",
        "fieldName",
        "oldValue",
        "newValue",
      ]);
    });

    it("snapshot: matches expected structure", function () {
      const multiChanges: Change[] = [
        {
          itemLibraryID: 1,
          itemKey: "A1",
          itemTitle: "Paper One",
          field: "author",
          oldValue: "Smith, John; Doe, Jane",
          newValue: "Smith, John and Doe, Jane",
        },
        {
          itemLibraryID: 1,
          itemKey: "A2",
          itemTitle: "论文二",
          field: "issue",
          oldValue: "第3期",
          newValue: "3",
        },
      ];
      const data = renderDialog(multiChanges, 4, mockGetString);

      const expected: DialogData = {
        summary: "dialog-summary-clean-items:total=4,changes=2,unchanged=2",
        columns: [
          "dialog-column-item",
          "dialog-column-field",
          "dialog-column-change",
        ],
        rows: [
          {
            itemTitle: "Paper One",
            fieldName: "field-author",
            oldValue: "Smith, John; Doe, Jane",
            newValue: "Smith, John and Doe, Jane",
          },
          {
            itemTitle: "论文二",
            fieldName: "field-issue",
            oldValue: "第3期",
            newValue: "3",
          },
        ],
      };
      assert.deepEqual(data, expected);
    });
  });

  describe("renderDialogHtml", function () {
    it("produces HTML containing all row data", function () {
      const data: DialogData = {
        summary: "2 changes in 3 items",
        columns: ["Item", "Field", "Change"],
        rows: [
          {
            itemTitle: "Paper One",
            fieldName: "field-author",
            oldValue: "old",
            newValue: "new",
          },
        ],
      };
      const html = renderDialogHtml(data);

      assert.include(html, "Paper One");
      assert.include(html, "author");
      assert.include(html, "old");
      assert.include(html, "new");
      assert.include(html, "2 changes in 3 items");
      assert.include(html, "Item");
      assert.include(html, "Field");
      assert.include(html, "Change");
    });

    it("escapes HTML special characters in data", function () {
      const data: DialogData = {
        summary: "<script>alert('xss')</script>",
        columns: ["A", "B", "C"],
        rows: [
          {
            itemTitle: "Title with <b>bold</b>",
            fieldName: "field&name",
            oldValue: '"quoted"',
            newValue: "'single'",
          },
        ],
      };
      const html = renderDialogHtml(data);

      assert.notInclude(html, "<script>");
      assert.notInclude(html, "<b>bold</b>");
      assert.include(html, "&lt;script&gt;");
      assert.include(html, "&lt;b&gt;bold&lt;/b&gt;");
      assert.include(html, "field&amp;name");
      assert.include(html, "&quot;quoted&quot;");
      assert.include(html, "&#39;single&#39;");
    });

    it("includes style block and table structure", function () {
      const data: DialogData = {
        summary: "test",
        columns: ["A", "B", "C"],
        rows: [],
      };
      const html = renderDialogHtml(data);

      assert.include(html, "<style>");
      assert.include(html, ".bibtex-clean-summary");
      assert.include(html, ".bibtex-clean-table");
      assert.include(html, "<thead>");
      assert.include(html, "<tbody>");
    });

    it("renders multiple rows", function () {
      const data: DialogData = {
        summary: "test",
        columns: ["A", "B", "C"],
        rows: [
          {
            itemTitle: "First",
            fieldName: "field-author",
            oldValue: "a",
            newValue: "b",
          },
          {
            itemTitle: "Second",
            fieldName: "field-issue",
            oldValue: "1",
            newValue: "2",
          },
        ],
      };
      const html = renderDialogHtml(data);

      assert.include(html, "First");
      assert.include(html, "Second");
    });
  });

  describe("escapeHtml", function () {
    it("escapes ampersand", function () {
      assert.equal(escapeHtml("a&b"), "a&amp;b");
    });

    it("escapes angle brackets", function () {
      assert.equal(escapeHtml("<div>"), "&lt;div&gt;");
    });

    it("escapes double quotes", function () {
      assert.equal(escapeHtml('"hello"'), "&quot;hello&quot;");
    });

    it("escapes single quotes", function () {
      assert.equal(escapeHtml("it's"), "it&#39;s");
    });

    it("returns plain text unchanged", function () {
      assert.equal(escapeHtml("hello world"), "hello world");
    });

    it("handles empty string", function () {
      assert.equal(escapeHtml(""), "");
    });
  });
});
