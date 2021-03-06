/* @flow */

import {Entity} from 'draft-js';
import {
  getEntityRanges,
  BLOCK_TYPE, ENTITY_TYPE, INLINE_STYLE,
} from 'draft-js-tools';

import type {ContentState, ContentBlock, EntityInstance} from 'draft-js';
import type {CharacterMetaList} from 'draft-js-tools';

type StringMap = {[key: string]: ?string};

const {
  BOLD,
  CODE,
  ITALIC,
  STRIKETHROUGH,
  UNDERLINE,
} = INLINE_STYLE;

const INDENT = '  ';
const BREAK = '<br/>';

// Map entity data to element attributes.
const ENTITY_ATTR_MAP = {
  [ENTITY_TYPE.LINK]: {url: 'href', rel: 'rel', target: 'target', title: 'title'},
  [ENTITY_TYPE.IMAGE]: {src: 'src', height: 'height', width: 'width', alt: 'alt'},
};

// Map entity data to element attributes.
const DATA_TO_ATTR = {
  [ENTITY_TYPE.LINK](entityType: string, entity: EntityInstance): StringMap {
    let attrMap = ENTITY_ATTR_MAP.hasOwnProperty(entityType) ? ENTITY_ATTR_MAP[entityType] : {};
    let data = entity.getData();
    let attrs = {};
    for (let dataKey of Object.keys(data)) {
      let dataValue = data[dataKey];
      if (attrMap.hasOwnProperty(dataKey)) {
        let attrKey = attrMap[dataKey];
        attrs[attrKey] = dataValue;
      }
    }
    return attrs;
  },
  [ENTITY_TYPE.IMAGE](entityType: String, entity: EntityInstance): StringMap {
    let attrMap = ENTITY_ATTR_MAP.hasOwnProperty(entityType) ? ENTITY_ATTR_MAP[entityType] : {};
    let data = entity.getData();
    let attrs = {};
    for (let dataKey of Object.keys(data)) {
      let dataValue = data[dataKey];
      if (attrMap.hasOwnProperty(dataKey)) {
        let attrKey = attrMap[dataKey];
        attrs[attrKey] = dataValue;
      }
    }
    return attrs;
  },
};

// The reason this returns an array is because a single block might get wrapped
// in two tags.
function getTags(blockType: string): Array<string> {
  switch (blockType) {
    case BLOCK_TYPE.HEADER_ONE:
      return ['h1'];
    case BLOCK_TYPE.HEADER_TWO:
      return ['h2'];
    case BLOCK_TYPE.HEADER_THREE:
      return ['h3'];
    case BLOCK_TYPE.HEADER_FOUR:
      return ['h4'];
    case BLOCK_TYPE.HEADER_FIVE:
      return ['h5'];
    case BLOCK_TYPE.HEADER_SIX:
      return ['h6'];
    case BLOCK_TYPE.UNORDERED_LIST_ITEM:
    case BLOCK_TYPE.ORDERED_LIST_ITEM:
      return ['li'];
    case BLOCK_TYPE.BLOCKQUOTE:
      return ['blockquote'];
    case BLOCK_TYPE.CODE:
      return ['pre', 'code'];
    default:
      return ['p'];
  }
}

function getWrapperTag(blockType: string): ?string {
  switch (blockType) {
    case BLOCK_TYPE.UNORDERED_LIST_ITEM:
      return 'ul';
    case BLOCK_TYPE.ORDERED_LIST_ITEM:
      return 'ol';
    default:
      return null;
  }
}

class MarkupGenerator {
  blocks: Array<ContentBlock>;
  contentState: ContentState;
  currentBlock: number;
  indentLevel: number;
  output: Array<string>;
  totalBlocks: number;
  wrapperTag: ?string;

  constructor(contentState: ContentState) {
    this.contentState = contentState;
  }

  generate(): string {
    this.output = [];
    this.blocks = this.contentState.getBlocksAsArray();
    this.totalBlocks = this.blocks.length;
    this.currentBlock = 0;
    this.indentLevel = 0;
    this.wrapperTag = null;
    while (this.currentBlock < this.totalBlocks) {
      this.processBlock();
    }
    this.closeWrapperTag();
    return this.output.join('').trim();
  }

  processBlock() {
    let block = this.blocks[this.currentBlock];
    let blockType = block.getType();
    let newWrapperTag = getWrapperTag(blockType);
    if (this.wrapperTag !== newWrapperTag) {
      if (this.wrapperTag) {
        this.closeWrapperTag();
      }
      if (newWrapperTag) {
        this.openWrapperTag(newWrapperTag);
      }
    }
    this.indent();
    this.writeStartTag(blockType);
    this.output.push(this.renderBlockContent(block));
    // Look ahead and see if we will nest list.
    let nextBlock = this.getNextBlock();
    if (
      canHaveDepth(blockType) &&
      nextBlock &&
      nextBlock.getDepth() === block.getDepth() + 1
    ) {
      this.output.push(`\n`);
      // This is a litle hacky: temporarily stash our current wrapperTag and
      // render child list(s).
      let thisWrapperTag = this.wrapperTag;
      this.wrapperTag = null;
      this.indentLevel += 1;
      this.currentBlock += 1;
      this.processBlocksAtDepth(nextBlock.getDepth());
      this.wrapperTag = thisWrapperTag;
      this.indentLevel -= 1;
      this.indent();
    } else {
      this.currentBlock += 1;
    }
    this.writeEndTag(blockType);
  }

  processBlocksAtDepth(depth: number) {
    let block = this.blocks[this.currentBlock];
    while (block && block.getDepth() === depth) {
      this.processBlock();
      block = this.blocks[this.currentBlock];
    }
    this.closeWrapperTag();
  }

  getNextBlock(): ContentBlock {
    return this.blocks[this.currentBlock + 1];
  }

  writeStartTag(blockType) {
    let tags = getTags(blockType);
    for (let tag of tags) {
      this.output.push(`<${tag}>`);
    }
  }

  writeEndTag(blockType) {
    let tags = getTags(blockType);
    if (tags.length === 1) {
      this.output.push(`</${tags[0]}>\n`);
    } else {
      let output = [];
      for (let tag of tags) {
        output.unshift(`</${tag}>`);
      }
      this.output.push(output.join('') + '\n');
    }
  }

  openWrapperTag(wrapperTag: string) {
    this.wrapperTag = wrapperTag;
    this.indent();
    this.output.push(`<${wrapperTag}>\n`);
    this.indentLevel += 1;
  }

  closeWrapperTag() {
    if (this.wrapperTag) {
      this.indentLevel -= 1;
      this.indent();
      this.output.push(`</${this.wrapperTag}>\n`);
      this.wrapperTag = null;
    }
  }

  indent() {
    this.output.push(INDENT.repeat(this.indentLevel));
  }

  renderBlockContent(block: ContentBlock): string {
    let blockType = block.getType();
    let text = block.getText();
    if (text === '') {
      // Prevent element collapse if completely empty.
      return BREAK;
    }
    text = this.preserveWhitespace(text);
    let charMetaList: CharacterMetaList = block.getCharacterList();
    let entityPieces = getEntityRanges(text, charMetaList);
    return entityPieces.map(([entityKey, stylePieces]) => {
      let content = stylePieces.map(([text, style]) => {
        let content = encodeContent(text);
        // These are reverse alphabetical by tag name.
        if (style.has(BOLD)) {
          content = `<strong>${content}</strong>`;
        }
        if (style.has(UNDERLINE)) {
          content = `<ins>${content}</ins>`;
        }
        if (style.has(ITALIC)) {
          content = `<em>${content}</em>`;
        }
        if (style.has(STRIKETHROUGH)) {
          content = `<del>${content}</del>`;
        }
        if (style.has(CODE)) {
          // If our block type is CODE then we are already wrapping the whole
          // block in a `<code>` so don't wrap inline code elements.
          content = (blockType === BLOCK_TYPE.CODE) ? content : `<code>${content}</code>`;
        }
        return content;
      }).join('');
      let entity = entityKey ? Entity.get(entityKey) : null;
      let entityType = (entity == null) ? null : entity.getType();
      if (entityType != null && entityType === ENTITY_TYPE.LINK) {
        let attrs = DATA_TO_ATTR.hasOwnProperty(entityType) ? DATA_TO_ATTR[entityType](entityType, entity) : null;
        let strAttrs = stringifyAttrs(attrs);
        return `<a${strAttrs}>${content}</a>`;
      } else if (entityType != null && entityType === ENTITY_TYPE.IMAGE) {
        let attrs = DATA_TO_ATTR.hasOwnProperty(entityType) ? DATA_TO_ATTR[entityType](entityType, entity) : null;
        let strAttrs = stringifyAttrs(attrs);
        return `<img${strAttrs}/>`;
      } else {
        return content;
      }
    }).join('');
  }

  preserveWhitespace(text: string): string {
    let length = text.length;
    // Prevent leading/trailing/consecutive whitespace collapse.
    let newText = new Array(length);
    for (let i = 0; i < length; i++) {
      if (
        text[i] === ' ' &&
        (i === 0 || i === length - 1 || text[i - 1] === ' ')
      ) {
        newText[i] = '\xA0';
      } else {
        newText[i] = text[i];
      }
    }
    return newText.join('');
  }

}

function stringifyAttrs(attrs) {
  if (attrs == null) {
    return '';
  }
  let parts = [];
  for (let attrKey of Object.keys(attrs)) {
    let attrValue = attrs[attrKey];
    if (attrValue != null) {
      parts.push(` ${attrKey}="${encodeAttr(attrValue + '')}"`);
    }
  }
  return parts.join('');
}

function canHaveDepth(blockType: string): boolean {
  switch (blockType) {
    case BLOCK_TYPE.UNORDERED_LIST_ITEM:
    case BLOCK_TYPE.ORDERED_LIST_ITEM:
      return true;
    default:
      return false;
  }
}

function encodeContent(text: string): string {
  return text
    .split('&').join('&amp;')
    .split('<').join('&lt;')
    .split('>').join('&gt;')
    .split('\xA0').join('&nbsp;')
    .split('\n').join(BREAK + '\n');
}

function encodeAttr(text: string): string {
  return text
    .split('&').join('&amp;')
    .split('<').join('&lt;')
    .split('>').join('&gt;')
    .split('"').join('&quot;');
}

export default function stateToHTML(content: ContentState): string {
  return new MarkupGenerator(content).generate();
}
