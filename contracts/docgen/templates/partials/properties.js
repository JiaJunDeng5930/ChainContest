const { DOC_ITEM_CONTEXT } = require("solidity-docgen/dist/site");

const NON_ALPHANUMERIC = /[^a-z0-9]+/gi;
const DASH_DUPLICATES = /-+/g;
const TRIM_DASH = /^-+|-+$/g;

function slugify(value) {
  if (!value) return "";
  return value
    .replace(/([a-z\d])([A-Z])/g, "$1-$2")
    .toLowerCase()
    .replace(NON_ALPHANUMERIC, "-")
    .replace(DASH_DUPLICATES, "-")
    .replace(TRIM_DASH, "");
}

function anchor(ctx) {
  const { item, contract } = ctx;
  if (!contract) {
    return undefined;
  }
  const base = slugify(contract.name || "contract");
  let itemName = "";
  if (typeof item.name === "string" && item.name.length > 0) {
    itemName = item.name;
  } else if (typeof item.kind === "string" && item.kind.length > 0) {
    itemName = item.kind;
  }
  if (!itemName) {
    return undefined;
  }
  let typeSegment = "";
  switch (item.nodeType) {
    case "FunctionDefinition":
      typeSegment = "function";
      break;
    case "EventDefinition":
      typeSegment = "event";
      break;
    case "ErrorDefinition":
      typeSegment = "error";
      break;
    case "ModifierDefinition":
      typeSegment = "modifier";
      break;
    case "VariableDeclaration":
      typeSegment = "variable";
      break;
    default:
      return undefined;
  }
  const slug = [base, typeSegment, slugify(itemName)].filter(Boolean).join("-");
  return slug || undefined;
}

module.exports = {
  anchor({ item }) {
    const context = item[DOC_ITEM_CONTEXT];
    if (!context) {
      return undefined;
    }
    return anchor(context);
  },
};
