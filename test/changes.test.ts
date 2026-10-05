import { assert } from "chai";
import { computeChanges, type CleanableItem } from "../src/modules/changes";

describe("changes", function () {
  describe("computeChanges", function () {
    it("单个脏 author 字段返回一条变更", function () {
      const items: CleanableItem[] = [
        {
          libraryID: 1,
          key: "A1",
          title: "Paper One",
          author: "Smith, John; Doe, Jane",
        },
      ];
      const changes = computeChanges(items);
      assert.lengthOf(changes, 1);
      assert.deepEqual(changes[0], {
        itemLibraryID: 1,
        itemKey: "A1",
        itemTitle: "Paper One",
        field: "author",
        oldValue: "Smith, John; Doe, Jane",
        newValue: "Smith, John and Doe, Jane",
      });
    });

    it("多个条目时只返回脏字段的变更", function () {
      const items: CleanableItem[] = [
        {
          libraryID: 1,
          key: "A1",
          title: "Dirty",
          author: "Smith, John; Doe, Jane",
        },
        {
          libraryID: 1,
          key: "A2",
          title: "Clean",
          author: "Smith, John and Doe, Jane",
        },
      ];
      const changes = computeChanges(items);
      assert.lengthOf(changes, 1);
      assert.equal(changes[0].itemKey, "A1");
    });

    it("无变更时返回空数组", function () {
      const items: CleanableItem[] = [
        {
          libraryID: 1,
          key: "A1",
          title: "Clean",
          author: "Smith, John and Doe, Jane",
        },
      ];
      assert.deepEqual(computeChanges(items), []);
    });

    it("输入为空时返回空数组", function () {
      assert.deepEqual(computeChanges([]), []);
    });

    it("多个条目和字段返回多条变更", function () {
      const items: CleanableItem[] = [
        {
          libraryID: 1,
          key: "A1",
          title: "Paper One",
          author: "Smith, John; Doe, Jane",
          issue: "第三期",
        },
        {
          libraryID: 1,
          key: "A2",
          title: "Paper Two",
          author: "Smith, John and Doe, Jane",
        },
        { libraryID: 1, key: "A3", title: "Paper Three", issue: "3" },
      ];
      const changes = computeChanges(items);
      assert.lengthOf(changes, 2);
      assert.deepEqual(changes[0], {
        itemLibraryID: 1,
        itemKey: "A1",
        itemTitle: "Paper One",
        field: "author",
        oldValue: "Smith, John; Doe, Jane",
        newValue: "Smith, John and Doe, Jane",
      });
      assert.deepEqual(changes[1], {
        itemLibraryID: 1,
        itemKey: "A1",
        itemTitle: "Paper One",
        field: "issue",
        oldValue: "第三期",
        newValue: "三",
      });
    });

    it("脏 volume 字段返回一条变更", function () {
      const items: CleanableItem[] = [
        {
          libraryID: 1,
          key: "A1",
          title: "Paper One",
          volume: "Vol.12",
        },
      ];
      const changes = computeChanges(items);
      assert.lengthOf(changes, 1);
      assert.deepEqual(changes[0], {
        itemLibraryID: 1,
        itemKey: "A1",
        itemTitle: "Paper One",
        field: "volume",
        oldValue: "Vol.12",
        newValue: "12",
      });
    });
  });
});
