// web/lib/help/content/csv-import.zh.ts
// Simplified Chinese sibling of csv-import.ts. Drafted via the local 3090 tier
// (ask-local --translate zh) and reviewed by hand. `labels` stay in English
// on purpose: the editor and import UI are hardcoded English in every locale,
// so the on-screen text the renderer bolds and the audit greps for is English.
import type { HelpArticleContent } from '@matthewdbaldwin/microport-ui/help/logic';

const csvImport: HelpArticleContent = {
  slug: 'csv-import',
  title: 'CSV 导入和导出',
  intro: 'Export CSV 会将整个目录下载为电子表格。Import CSV 会将电子表格写回，每行创建或更新一个产品。Verify (dry run) 会检查文件而不写入任何内容。这三个功能位于顶部栏中，仅对管理员可见。',
  lastUpdated: '2026-09-04',
  sections: [
    {
      id: 'workflow', heading: '推荐的工作流程',
      blocks: [
        { kind: 'steps', steps: [
          '点击 Export CSV 下载 productport-catalog.csv：即当前目录，列布局与导入器要求的完全一致。',
          '在电子表格中编辑该文件。保留所有列，为新产品添加行，并且不更改的行保持原样。',
          '点击 Verify (dry run) 并选择文件；文件选择器会直接打开。',
          '查看按钮旁边的结果：Preview: N new, M updated，如果有行存在问题，还会显示 K would fail。点击 Download errors 保存 import-errors.csv，其中列出每个失败行及其 slug 和原因。',
          '在电子表格中修正这些行，然后再次验证，直到没有行会失败。',
          '点击 Import CSV 并选择文件。结果会显示 Imported: N new, M updated，如果有行被拒绝，还会显示 K failed；随后目录会重新加载。',
        ], labels: ['Export CSV', 'Verify (dry run)', 'Download errors', 'Import CSV'] },
        { kind: 'paragraph', text: '结果以内联文字显示在按钮旁边（不是 Toast 提示），并会一直保留到下一次运行。在 import-errors.csv 中，行号将标题行计为第 1 行；空行会被跳过，因此含有空行的文件，其行号可能与电子表格中的行号不一致。最大接受 15 MB 的文件。', labels: ['Download errors', 'Verify (dry run)'] },
      ],
    },
    {
      id: 'header-check', heading: '表头校验',
      blocks: [
        { kind: 'paragraph', text: '在读取任何一行之前，会将表头与 Export CSV 生成的 36 列进行校验。所有列都必须存在，顺序无关；多余的列会被忽略并在结果中列为未知。如果缺少任何一列，整个文件会被拒绝，且没有任何行更改，因为导入会替换所有列，不完整的表头会抹掉数据。请从导出文件开始，而不要手动构建文件。', labels: ['Export CSV', 'Import CSV'] },
      ],
    },
    {
      id: 'matching', heading: '行如何匹配产品',
      blocks: [
        { kind: 'list', items: [
          '匹配键是 id 列，该列是产品的 slug（小写字母、数字和短横线），必须完全匹配。现有的 slug 会更新该产品；新的 slug 会创建一个新产品。绝不会按名称匹配。',
          '更新会将每一列替换为 CSV 中的值；空白单元格会清空该字段。例外情况是 tier、classification 和 status，空白单元格会保留现有值。',
          '各行逐一独立处理。失败的行会被列出，其他行仍然写入；不会回滚。如果两行共享同一个 id，最后一行生效。',
          '与已删除产品匹配的 slug 会被拒绝；产品不会被恢复。',
          '临床试验数据和图库图片不受导入影响。',
        ] },
      ],
    },
    {
      id: 'row-rules', heading: '每一行必须包含的内容',
      blocks: [
        { kind: 'list', items: [
          'id、name、subsidiary 和 therapeutic_area 是必填项。therapeutic_area 必须是十个标准治疗领域名称之一，拼写必须与导出文件完全一致。',
          '市场列 fda、ce、nmpa、pmda 和 tga 可接受 cleared 或 approved、in progress、submitted、not cleared，以及空白或 none。任何其他词都会悄无声息地变为 none，而且 Verify (dry run) 不会标记它，因此像 clearred 这样的拼写错误会抹掉该市场的状态。',
          '每个 *_qualifier 必须为空或 CMD-only、CE-invalid、agent、pending、recently-approved 中的一个。每个 *_cert 以竖线（|）分隔（如 CE-100|CE-200），最多 1000 个字符。',
          'tier 接受 1、Tier 1、TIER1 及类似拼写；classification 接受 CORE、HIPO、FLAGSHIP 以及几种完整拼写形式。这两个字段中的未知词会悄无声息地变为空白，而空白在更新时会保留现有值。',
          'status 必须为 ACTIVE、DISCONTINUED 或 DRAFT；任何其他词都是行错误。请记住，DRAFT 会对所有人（包括管理员）隐藏产品，之后只能通过 Import CSV 改回来。',
          '自由文本列的长度限制与编辑器相同，例如 name 为 255 个字符，tagline 为 500 个字符。',
        ], labels: ['Verify (dry run)', 'Import CSV'] },
      ],
    },
    {
      id: 'notes-warning', heading: '准入 Notes 会被导入清除',
      blocks: [
        { kind: 'paragraph', text: '导入会删除并重新创建文件中每个产品的所有五个准入行，并始终将 Notes 写为空，因为没有 notes 列。导入某个产品（即使导入的是未经修改的导出文件）会清除在编辑器 Regulatory clearances 部分输入的所有 Notes。证书号和 Qualifier 可以正常往返。', labels: ['Notes', 'Regulatory clearances', 'Import CSV'] },
      ],
    },
    {
      id: 'export', heading: '导出包含的内容',
      blocks: [
        { kind: 'list', items: [
          '所有未被删除的产品，包括 DRAFT 和禁用的产品，按名称顺序排列，最多 5,000 行，保存为 productport-catalog.csv。',
          '所有 36 列；没有 Notes 列。市场状态以文字形式写入（cleared、in progress、submitted、not cleared 或空白）；tier、classification 和 status 以它们的枚举值写入（TIER1、CORE、ACTIVE 等等）。',
          '以 =、+、- 或 @ 开头的单元格写入时会加上一个前导撇号，以防止电子表格把它当作公式执行。重新导入时，该撇号会作为文本的一部分被导入，因此在导入前请检查此类单元格（例如以短横线开头的 tagline）。',
        ], labels: ['Export CSV', 'Notes'] },
      ],
    },
    {
      id: 'faq', heading: '常见问题',
      blocks: [
        { kind: 'faq', items: [
          { q: '我必须在每次导入前都进行验证吗？', a: '这不是强制要求，但 Verify (dry run) 会运行与真实导入相同的检查而不会写入任何内容，因此这是发现问题行最省力的方式。' },
          { q: '如果某些行失败，会回滚任何内容吗？', a: '不会。每行都是独立处理的，已通过的行已经被写入。修正失败的行并重新导入文件；未更改的行只是被更新为相同的值。' },
          { q: '为什么导入后某个市场的状态消失了？', a: '最可能是该市场列中的拼写错误。导入器无法识别的任何词都会变为 none 而不报错。请将拼写与导出进行比对，然后重新导入。' },
          { q: '我可以导入只包含我想修改的列的文件吗？', a: '不可以。必须包含所有 36 列，因为更新会替换所有列。导出目录，修改需要的单元格，然后导入该文件。' },
          { q: '我可以手动构建文件吗？', a: '可以，但必须包含所有 36 列，并且表头名称必须完全匹配。从 Export CSV 开始要安全得多。' },
        ] },
      ],
    },
  ],
  related: ['product-edit', 'product-create', 'catalog-browse'],
};

export default csvImport;
