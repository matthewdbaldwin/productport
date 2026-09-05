// web/lib/help/content/product-edit.zh.ts
// Simplified Chinese sibling of product-edit.ts. Drafted via the local 3090 tier
// (ask-local --translate zh) and reviewed by hand. `labels` stay in English
// on purpose: the editor and import UI are hardcoded English in every locale,
// so the on-screen text the renderer bolds and the audit greps for is English.
import type { HelpArticleContent } from '@matthewdbaldwin/microport-ui/help/logic';

const productEdit: HelpArticleContent = {
  slug: 'product-edit',
  title: '编辑产品',
  intro: '从目录中打开一个产品并点击 Edit。它与 Add product 表单相同，已预填充，另外还有两个仅在此处存在的部分：Product images 和 Regulatory clearances。图片更改会立即保存；其他内容通过 Save changes 保存。',
  lastUpdated: '2026-09-04',
  sections: [
    {
      id: 'open-the-editor', heading: '打开编辑器',
      blocks: [
        { kind: 'paragraph', text: '点击卡片打开详情视图，然后点击 Edit（仅管理员可见）。表单标题为 Edit 后跟产品名称，每个字段都已预填充。Slug (url key) 可以重命名，但新 slug 不能与其他产品重复；重命名会更改产品的链接及其在 CSV 中的 id 列。', labels: ['Edit', 'Slug (url key)'] },
      ],
    },
    {
      id: 'fields', heading: '产品字段和状态',
      blocks: [
        { kind: 'paragraph', text: '字段与添加产品时相同，包括 Features、Specifications 和 Model numbers 的竖线分隔格式。清空可选字段会将其清除；Name、Slug (url key)、Subsidiary 和 Therapeutic area 不能清空。', labels: ['Features', 'Specifications', 'Model numbers', 'Name', 'Subsidiary'] },
        { kind: 'list', items: [
          'DISCONTINUED 不会隐藏或删除产品，目录中没有任何内容会显示该状态。',
          '要对查看者隐藏产品，请改用详情视图中的 Disable。管理员仍然可以看到它（带 DISABLED 徽章），并可以再次启用它。',
          'DRAFT 会对所有人（包括管理员）隐藏产品。它会从网格中消失，无法在应用中打开或编辑，唯一的恢复方法是 Export CSV，更改该行的 status 单元格，然后 Import CSV。',
        ], labels: ['Status', 'Disable', 'Export CSV', 'Import CSV'] },
      ],
    },
    {
      id: 'product-images', heading: '产品图片（Product images）',
      blocks: [
        { kind: 'paragraph', text: '此部分的每次更改都会作为独立操作立即保存。添加图片、Set primary 和 Delete 都不属于 Save changes，Cancel 也无法撤销它们。', labels: ['Product images', 'Set primary', 'Delete', 'Save changes', 'Cancel'] },
        { kind: 'list', items: [
          '+ Add image 接受 JPEG、PNG 或 WebP，最大 6 MB。大图片会在上传前在浏览器中缩小；GIF 和 SVG 被拒绝。',
          '您上传的第一张图片将成为主图，并显示在目录卡片上。点击其他图片下方的 Set primary，会把 Primary 徽章移到该图片上。',
          'Delete 会就地显示 Delete? 以及 Yes 和 No。删除主图后，下一张图片会自动成为主图；删除最后一张图片后，产品将没有图片。',
        ], labels: ['+ Add image', 'Set primary', 'Primary', 'Delete'] },
      ],
    },
    {
      id: 'regulatory-clearances', heading: '监管准入（Regulatory clearances）',
      blocks: [
        { kind: 'paragraph', text: '准入（Clearance）是指产品获准在某一辖区销售。矩阵有五个固定行：CE、FDA、NMPA、PMDA 和 TGA，每行包含 Status、Certificate number(s)、Qualifier 和 Notes。这些行相互独立。', labels: ['Regulatory clearances', 'Status', 'Qualifier', 'Notes'] },
        { kind: 'list', items: [
          'Status 为 NONE、IN_PROGRESS、SUBMITTED、APPROVED 或 NOT_APPROVED。它决定卡片上的市场标签、Regulatory 筛选器，以及详情视图中的状态表格。',
          'Certificate number(s) 记录该准入的注册（Registration）凭证，即证书号或注册证号，以竖线分隔（例如 CE-100|CE-200），最多 1000 字符。',
          'Qualifier 是从固定列表中选择的附加说明：CMD-only、CE-invalid、agent、pending 或 recently-approved。',
          'Notes 是最多 2000 字符的自由文本。Notes 只在此处（在编辑器中）可见。',
        ], labels: ['Status', 'Certificate number(s)', 'Qualifier', 'Notes'] },
        { kind: 'paragraph', text: '矩阵通过 Save changes 保存，且仅在您修改过某个单元格时才会保存。产品字段会先保存，然后才是准入信息。如果准入保存失败，产品字段已经保存，错误会显示在横幅和 Toast 提示中，表单保持打开以便您重试。', labels: ['Save changes', 'Regulatory clearances'] },
        { kind: 'paragraph', text: '对该产品进行 CSV 导入（即使导入的是未经修改的导出文件）会清除每个地区的 Notes，因为 Notes 从不导出。证书号和 Qualifier 可以正常往返。如果目录通过 CSV 维护，请不要把重要信息放在 Notes 中。', labels: ['Notes', 'Import CSV', 'Export CSV'] },
      ],
    },
    {
      id: 'saving', heading: '保存、取消和删除',
      blocks: [
        { kind: 'list', items: [
          'Save changes 会写入产品字段；如果您修改过准入矩阵，也会一并写入。成功后会显示 Changes saved. 提示，编辑器和详情视图都会关闭，目录会重新加载；再次点击卡片以查看更新。',
          'Cancel、× 按钮、Esc 或点击遮罩会关闭表单；如果进行了更改，会提示 Discard your unsaved changes? 已经进行的图片更改会保留。',
          'Delete（左下角）会提示 Delete this product? 然后 Confirm delete。这是软删除，无法在应用内恢复：要恢复产品需要数据库操作，在此之前，使用该 slug 的 CSV 行会被拒绝。',
        ], labels: ['Save changes', 'Changes saved.', 'Cancel', 'Delete', 'Confirm delete'] },
      ],
    },
    {
      id: 'faq', heading: '常见问题',
      blocks: [
        { kind: 'faq', items: [
          { q: '我点击了 Cancel，但被删除的图片没有恢复。', a: '图片更改会立即保存为独立的操作，不属于 Save changes，因此 Cancel 无法撤销它们。请重新上传图片。' },
          { q: 'DISCONTINUED 会对查看者隐藏产品吗？', a: '不会。目录中没有任何内容会显示该状态。要对查看者隐藏产品，请在详情视图中使用 Disable；要移除产品，请使用 Delete。' },
          { q: '我的准入 Notes 消失了。', a: 'CSV 导入会重写所有五个准入行，并且始终将 Notes 写为空，因为导出没有 Notes 列。请在编辑器中重新输入它们。' },
          { q: '一个地区可以有多个证书号码吗？', a: '可以。在 Certificate number(s) 中用竖线分隔，例如 CE-100|CE-200。' },
          { q: '我可以撤销删除吗？', a: '在应用中不可以。产品在数据库中被软删除；请申请数据库恢复。在此之前，使用相同 slug 的 CSV 行会被拒绝。' },
        ] },
      ],
    },
  ],
  related: ['product-create', 'product-detail', 'csv-import'],
};

export default productEdit;
