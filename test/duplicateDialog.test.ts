import { assert } from "chai";
import type { TagElementProps } from "zotero-plugin-toolkit";
import {
  DUPLICATE_DIALOG_DATA_KEYS,
  DUPLICATE_DIALOG_IDS,
  buildDuplicateDialogContent,
  buildGroupItems,
  renderDuplicateDialog,
  type DuplicateDialogData,
} from "../src/modules/duplicateDialog";
import {
  defaultTrashKeys,
  toDuplicateGroups,
  toggleCheckedKey,
  type DuplicateAttachment,
} from "../src/modules/duplicateGroups";

/** 回显 key 与参数，便于断言文案里的计数。 */
function mockGetString(
  key: string,
  options?: { args?: Record<string, unknown> },
): string {
  if (!options?.args) return key;
  const args = Object.entries(options.args)
    .map(([name, value]) => `${name}=${value}`)
    .join(",");
  return `${key}:${args}`;
}

function fileAttachment(
  overrides: Partial<DuplicateAttachment> & { itemKey: string },
): DuplicateAttachment {
  return {
    libraryID: 1,
    kind: "file-attachment",
    title: overrides.itemKey,
    parentTitle: "论文一",
    parentKey: "1\x00PARENT1",
    filename: "paper.pdf",
    dateAdded: "2024-01-01 08:00:00",
    annotationCount: 0,
    ...overrides,
  };
}

const groups = toDuplicateGroups([
  fileAttachment({
    itemKey: "KEEP",
    title: "带批注的副本",
    dateAdded: "2024-06-01 08:00:00",
    annotationCount: 3,
  }),
  fileAttachment({
    itemKey: "DROP",
    title: "合并带来的副本",
    dateAdded: "2024-01-01 08:00:00",
  }),
]);

function view(checkedKeys: string[]): DuplicateDialogData {
  return renderDuplicateDialog(groups, checkedKeys, mockGetString);
}

/** 展开元素树，便于按 tag/id/属性查找。 */
function flatten(props: TagElementProps): TagElementProps[] {
  return [props, ...(props.children ?? []).flatMap(flatten)];
}

function attr(props: TagElementProps, name: string): unknown {
  return props.attributes?.[name];
}

describe("duplicateDialog", function () {
  describe("renderDuplicateDialog", function () {
    it("renders one group with a header and one row per member", function () {
      const data = view(defaultTrashKeys(groups));

      assert.equal(data.title, "dialog-title-duplicate-delete");
      assert.equal(data.intro, "dialog-duplicate-intro");
      assert.lengthOf(data.groups, 1);
      assert.equal(data.groups[0].groupKey, "paper.pdf");
      assert.equal(data.groups[0].kindLabel, "dialog-duplicate-kind-file");
      assert.equal(data.groups[0].parentTitle, "论文一");
      assert.deepEqual(
        data.groups[0].rows.map((row) => [
          row.key,
          row.title,
          row.keepLabel,
          row.checked,
        ]),
        [
          ["1\x00KEEP", "带批注的副本", "dialog-duplicate-keep-badge", false],
          ["1\x00DROP", "合并带来的副本", undefined, true],
        ],
        "保留者排最前、不勾选、带保留徽章；其余默认勾选待删",
      );
    });

    it("shows the annotation count only for annotated members", function () {
      const data = view(defaultTrashKeys(groups));

      assert.equal(
        data.groups[0].rows[0].annotationLabel,
        "dialog-duplicate-annotations:count=3",
      );
      assert.isUndefined(data.groups[0].rows[1].annotationLabel);
    });

    it("trims dateAdded to the date part", function () {
      const data = view(defaultTrashKeys(groups));

      assert.equal(data.groups[0].rows[0].dateLabel, "2024-06-01");
      assert.equal(data.groups[0].rows[1].dateLabel, "2024-01-01");
    });

    it("counts checked rows in the summary and confirm label", function () {
      const data = view(defaultTrashKeys(groups));

      assert.equal(
        data.checkedSummary,
        "dialog-duplicate-checked-summary:count=1",
      );
      assert.equal(data.confirmLabel, "dialog-button-confirm-delete:count=1");
      assert.equal(data.checkedCount, 1);
    });

    it("reflects manual unchecking in the counts", function () {
      const data = view(
        toggleCheckedKey(defaultTrashKeys(groups), "1\x00DROP"),
      );

      assert.equal(data.checkedCount, 0);
      assert.equal(data.confirmLabel, "dialog-button-confirm-delete:count=0");
    });
  });

  describe("元素树", function () {
    it("builds a checkbox per member carrying its data-key", function () {
      const data = view(defaultTrashKeys(groups));
      const items = buildGroupItems(data);

      assert.lengthOf(items, 1);
      const memberRows = (items[0].children ?? []).filter((child) =>
        child.classList?.includes("duplicate-member-row"),
      );
      assert.lengthOf(memberRows, 2);

      const checkboxes = memberRows.map((row) =>
        (row.children ?? []).find(
          (child) =>
            child.tag === "input" && attr(child, "type") === "checkbox",
        ),
      );
      assert.deepEqual(
        checkboxes.map((box) => [
          attr(box!, DUPLICATE_DIALOG_DATA_KEYS.member),
          box!.properties?.checked,
        ]),
        [
          ["1\x00KEEP", false],
          ["1\x00DROP", true],
        ],
      );
      assert.equal(checkboxes[0]!.namespace, "html", "控件用 HTML");
    });

    it("renders keep badge, annotations and date as labels", function () {
      const data = view(defaultTrashKeys(groups));
      const memberRow = buildGroupItems(data)[0].children?.find((child) =>
        child.classList?.includes("duplicate-member-row"),
      );
      const labels = (memberRow?.children ?? []).filter(
        (child) => child.tag === "label",
      );

      assert.deepEqual(
        labels?.map((label) => attr(label, "value")),
        [
          "带批注的副本",
          "dialog-duplicate-annotations:count=3",
          "dialog-duplicate-keep-badge",
          "2024-06-01",
        ],
      );
    });

    it("wires the interactive containers and controls", function () {
      const content = buildDuplicateDialogContent(
        view(defaultTrashKeys(groups)),
      );
      const nodes = flatten(content);

      assert.equal(content.id, DUPLICATE_DIALOG_IDS.root);
      for (const id of [
        DUPLICATE_DIALOG_IDS.groupList,
        DUPLICATE_DIALOG_IDS.checkedSummary,
        DUPLICATE_DIALOG_IDS.selectNone,
      ]) {
        assert.isDefined(
          nodes.find((node) => node.id === id),
          `元素树里应有 id=${id}`,
        );
      }
      assert.isTrue(
        nodes.some(
          (node) => attr(node, DUPLICATE_DIALOG_DATA_KEYS.member) !== undefined,
        ),
        `元素树里应有 ${DUPLICATE_DIALOG_DATA_KEYS.member}`,
      );
    });

    it("keeps the group list container reusable for repainting", function () {
      const data = view(defaultTrashKeys(groups));
      const groupList = buildDuplicateDialogContent(data).children?.find(
        (child) => child.id === DUPLICATE_DIALOG_IDS.groupList,
      );

      assert.lengthOf(
        groupList?.children ?? [],
        1,
        "容器内是组元素，重绘时可整体替换",
      );
    });

    it("gives every element an explicit namespace, and controls use HTML", function () {
      const data = view(defaultTrashKeys(groups));
      const nodes = [
        ...flatten(buildDuplicateDialogContent(data)),
        ...buildGroupItems(data).flatMap(flatten),
      ];

      assert.deepEqual(
        nodes
          .filter(
            (node) => node.namespace !== "xul" && node.namespace !== "html",
          )
          .map((node) => node.tag),
        [],
        "每个元素都必须显式写 namespace",
      );
      assert.deepEqual(
        nodes
          .filter((node) => ["input", "button"].includes(node.tag ?? ""))
          .filter((node) => node.namespace !== "html")
          .map((node) => node.tag),
        [],
        "控件必须是 HTML：XUL 控件在插件对话框里不渲染自身文字",
      );
    });
  });
});
