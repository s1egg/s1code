import { describe, expect, it } from "vite-plus/test";

import { serializeTableElementToCsv, serializeTableElementToMarkdown } from "./markdown-clipboard";

describe("copying rendered Markdown tables", () => {
  it("copies footer rows last, as the table draws them, when tfoot precedes tbody", () => {
    const table = document.createElement("table");
    table.innerHTML =
      "<thead><tr><th>Item</th><th>Cost</th></tr></thead><tfoot><tr><td>Total</td><td>3</td></tr></tfoot><tbody><tr><td>a</td><td>1</td></tr><tr><td>b</td><td>2</td></tr></tbody>";

    expect(serializeTableElementToCsv(table)).toBe("Item,Cost\na,1\nb,2\nTotal,3");
    expect(serializeTableElementToMarkdown(table)).toBe(
      "| Item | Cost |\n| --- | --- |\n| a | 1 |\n| b | 2 |\n| Total | 3 |",
    );
  });
});
