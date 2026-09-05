// web/lib/help/content/product-create.zh.ts
// Simplified Chinese sibling of product-create.ts. Drafted via the local 3090 tier
// (ask-local --translate zh) and reviewed by hand. `labels` stay in English
// on purpose: the editor and import UI are hardcoded English in every locale,
// so the on-screen text the renderer bolds and the audit greps for is English.
import type { HelpArticleContent } from '@matthewdbaldwin/microport-ui/help/logic';

const productCreate: HelpArticleContent = {
  slug: 'product-create',
  title: '添加产品',
  intro: '顶部栏中的 Add product 会打开一个空白的产品表单。浏览器不做任何校验：由服务器校验保存内容，并指出被拒绝的字段。图片和监管准入信息随后在编辑模式中添加。',
  lastUpdated: '2026-09-04',
  sections: [
    {
      id: 'open-the-form', heading: '打开表单',
      blocks: [
        { kind: 'paragraph', text: '点击顶部栏中的 Add product（仅管理员可见）。表单标题为 Add product，焦点落在 Name 字段上。在输入任何内容后，通过 Cancel、× 按钮、Esc 或点击遮罩关闭表单时，会询问“Discard your unsaved changes?”', labels: ['Add product', 'Name', 'Cancel'] },
      ],
    },
    {
      id: 'fields', heading: '字段的顺序',
      blocks: [
        { kind: 'paragraph', text: '顶部的网格包含短字段；下方的全宽字段包含较长的文本。必填字段带有红色星号。空白的可选字段将被存储为空。' },
        { kind: 'list', items: [
          'Name、Slug (url key)、Subsidiary 和 Therapeutic area 是必填字段。Subsidiary 是自由文本；Therapeutic area 是包含十个标准治疗领域的下拉列表。',
          'Slug (url key)必须为小写字母、数字和短横线。它成为产品的链接（/?product=<slug>）以及 CSV 中的 id 列，已被占用的 slug 会被拒绝，因此请选择一个简短且稳定的 slug。',
        ], labels: ['Name', 'Slug (url key)', 'Subsidiary', 'Therapeutic area'] },
        { kind: 'list', items: [
          'Business segment、Category 和 Type 是自由文本。Image filename 是用于随应用一起发送的图像文件的遗留字段；仅在编辑模式下可以上传图像。',
          'Tier、Classification 和 Status 是固定列表（见下一部分）。Development status 是自由文本。',
          'Tagline、Overview、Indication、Patient population 和 Regulatory notes 是纯文本。',
          'Features、Specifications、Model numbers 和 Applicable departments 是以竖线（|）分隔的列表：Features 为 a|b|c，Specifications 为 key: value 对。每行输入的 Model numbers 会被接受并存储为竖线分隔的格式。',
        ], labels: ['Business segment', 'Category', 'Image filename', 'Features', 'Specifications'] },
      ],
    },
    {
      id: 'tier-classification-status', heading: 'Tier、Classification 和 Status',
      blocks: [
        { kind: 'list', items: [
          'Tier（Tier 1、Tier 2、Tier 3 或 none）以徽章形式显示在目录卡片和详情视图中。它不会过滤或隐藏任何内容。',
          'Classification（CORE、HIPO 或 FLAGSHIP）在应用中任何地方都不显示。它被存储，并且仅通过 CSV 导出和导入往返。',
          'Status 默认为 ACTIVE。DISCONTINUED 在任何地方都不显示给查看者，并且不会隐藏产品。',
        ], labels: ['Tier', 'Classification', 'Status'] },
        { kind: 'paragraph', text: '除非您确实打算对所有人（包括管理员）隐藏该产品，否则请不要选择 DRAFT。DRAFT 产品会从网格中消失，无法在应用中打开或编辑，唯一的恢复方法是 Export CSV，更改该行的 status 单元格，然后 Import CSV。', labels: ['Status', 'Export CSV', 'Import CSV'] },
      ],
    },
    {
      id: 'saving', heading: '保存和服务器校验的内容',
      blocks: [
        { kind: 'paragraph', text: '表单提交您输入的任何内容；浏览器中没有任何校验。点击 Create（请求进行时显示为 Saving…）。如果服务器拒绝保存，有问题的字段将获得红色轮廓并在其下方显示消息，同一条消息也会出现在表单顶部的横幅和 Toast 提示中。修复字段后再次点击 Create。', labels: ['Create', 'Cancel'] },
        { kind: 'list', items: [
          '缺少 Name、Slug (url key)、Subsidiary 或 Therapeutic area。',
          '包含大写字母、空格或其他字符的 slug，或者已存在的 slug（消息显示为 already exists）。',
          '文本超过字段限制，例如 Name 为 255 字符，Tagline 为 500 字符。',
        ], labels: ['Name', 'Slug (url key)', 'Tagline'] },
      ],
    },
    {
      id: 'after-create', heading: '创建后',
      blocks: [
        { kind: 'paragraph', text: '成功后表单关闭，显示 Product created. 提示，目录重新加载并按名称顺序显示新卡片。新产品不会自动打开。', labels: ['Create', 'Product created.'] },
        { kind: 'steps', steps: [
          '在网格中找到新卡片（如果目录很长，使用搜索框），然后点击它。',
          '在详情视图中点击 Edit。',
          '使用 Product images 和 Regulatory clearances。这两个部分仅在编辑模式中存在。',
        ], labels: ['Edit', 'Product images', 'Regulatory clearances'] },
        { kind: 'paragraph', text: '新产品尚无准入记录：卡片显示 Status: see detail，详情视图中所有五个地区显示为破折号，直到您填写 Regulatory clearances。', labels: ['Status: see detail', 'Regulatory clearances'] },
      ],
    },
    {
      id: 'faq', heading: '常见问题',
      blocks: [
        { kind: 'faq', items: [
          { q: '创建产品时能否添加图片或准入信息？', a: '不能。先创建产品，然后打开其卡片并点击 Edit。这两个部分仅在编辑模式中出现。' },
          { q: '为什么点击 Create 之前没有任何提示阻止我？', a: '表单没有浏览器端的校验。服务器会校验保存并突出显示任何被拒绝的字段；修复后再次点击 Create。' },
          { q: '我选择了 DRAFT，现在找不到产品。', a: 'DRAFT 会对所有人（包括您自己）隐藏该产品。Export CSV，将该行的 status 单元格改为 ACTIVE，然后 Import CSV 即可恢复。' },
          { q: 'Tier 或 Classification 是否会改变谁可以看到产品？', a: '不会。Tier 是卡片和详情视图中的徽章；Classification 从不显示。两者都不会过滤目录。' },
        ] },
      ],
    },
  ],
  related: ['product-edit', 'csv-import', 'catalog-browse'],
};

export default productCreate;
