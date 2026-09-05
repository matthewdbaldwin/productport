import type { HelpArticleContent } from '@matthewdbaldwin/microport-ui/help/logic';

const productDetail: HelpArticleContent = {
  slug:  'product-detail',
  title: '产品详情视图',
  intro: '点击目录卡片会打开该产品的详情视图：图片、描述、适应症和规格，以及它在五个市场中各自的监管状态。所有已登录的员工都可以打开它；产品管理员在这里还可以使用 Edit（编辑）和 Disable（禁用）。',
  lastUpdated: '2026-09-04',
  sections: [
    {
      id: 'opening', heading: '打开和关闭产品',
      blocks: [
        { kind: 'list', items: [
          '点击目录网格中的任意卡片。',
          '或者打开形如 /?product=<slug> 的直接链接；目录加载后会自动打开该产品。',
          '产品打开期间，地址栏会显示 ?product=<slug>；关闭后该参数随之移除。Copy link（复制链接）按钮可直接为您提供同一地址，无需操作地址栏。',
          '关闭方式：右上角的 × 按钮（Close）、Esc 键，或点击面板外部。',
        ], labels: ['Close', 'Copy link'] },
        { kind: 'paragraph', text: 'Copy link 会把该产品的可分享地址复制到剪贴板，按钮会短暂显示为 ✓ Link copied。如果浏览器阻止访问剪贴板，则会弹出一个小的 Copy this product link 提示框显示该地址，供您手动复制。持有链接的人必须登录 ProductPort 才能打开。', labels: ['Copy link', '✓ Link copied', 'Copy this product link'] },
        { kind: 'paragraph', text: '链接只能打开您有权查看的产品：查看者（viewer）通过链接访问已禁用的产品时，只会看到没有打开任何产品的普通目录；状态为 DRAFT 的产品任何人都无法打开。' },
      ],
    },
    {
      id: 'header', heading: '顶部区域',
      blocks: [
        { kind: 'list', items: [
          '主图：产品的主图片。当产品有多张图库图片时，主图下方会出现一排小缩略图；点击即可查看（每张的提示均为 View image，主图会额外注明）。',
          '治疗领域 · 类别；如果产品设有等级，还会显示 Tier 1、Tier 2 或 Tier 3 徽章。',
          '产品名称，然后是标语和子公司 · 类型。',
          '市场状态标签，规则与目录卡片相同：单独的代码（例如 FDA）表示已获批，代码后带圆点表示进行中或已提交，Status: see detail 表示没有任何市场处于有效状态。下方的监管表格始终给出完整信息。',
        ], labels: ['View image', 'Tier 1', 'Status: see detail'] },
      ],
    },
    {
      id: 'body', heading: '描述、适应症和规格',
      blocks: [
        { kind: 'list', items: [
          'Overview（概述）：产品描述，随后以项目符号列出功能特点。两者都为空时，此部分不显示。',
          'Indication（适应症）：该器械经监管批准可治疗的病症。',
          'Patient population（患者人群）：获批适应症适用的人群。',
          'Specifications（规格）：向监管机构申报的型号尺寸和关键规格，以“键: 值”标签形式显示。',
          '以上各项仅在产品记录了相应信息时才会显示，因此有些产品显示的标题会比其他产品少。',
        ], labels: ['Overview', 'Indication', 'Patient population', 'Specifications'] },
      ],
    },
    {
      id: 'regulatory', heading: '按市场划分的监管状态',
      blocks: [
        { kind: 'paragraph', text: 'Regulatory status by market（按市场划分的监管状态）表格始终显示。它按固定顺序列出五个市场：CE（欧盟）、FDA（美国）、NMPA（中国）、PMDA（日本）和 TGA（澳大利亚）；将鼠标悬停在代码上可查看全称。每一行显示一种状态：', labels: ['Regulatory status by market', 'Cleared', 'In progress'] },
        { kind: 'list', items: [
          'Cleared（已获批）：该产品在该市场已获得批准。',
          'In progress（进行中）或 Submitted（已提交）：该市场的审批正在进行，但尚未获批。',
          'Not cleared（未获批）：该产品在该市场被记录为未获批。',
          '短横线（—）：该市场没有任何记录。',
        ], labels: ['Cleared', 'In progress', 'Submitted', 'Not cleared'] },
        { kind: 'paragraph', text: '为该产品记录的监管备注会直接显示在表格下方。表格只显示状态：证书编号、批准限定条件和各市场的备注保存在产品记录中，但不会在此视图中显示。' },
      ],
    },
    {
      id: 'evidence', heading: '关键临床证据',
      blocks: [
        { kind: 'paragraph', text: '当产品记录了临床试验时，会显示 Key clinical evidence（关键临床证据）表格，列为 Trial（试验）、Identifier（标识符）、N、Design（设计）和 Result（结果）。大多数产品没有记录试验，此时该部分直接不显示。试验数据来自目录的种子数据；在 ProductPort 中无法通过表单或 CSV 添加或编辑试验。', labels: ['Key clinical evidence', 'Trial', 'Identifier', 'Design', 'Result'] },
      ],
    },
    {
      id: 'admin-actions', heading: '面向产品管理员',
      blocks: [
        { kind: 'roleBlock', roles: ['product_admin', 'superuser'], blocks: [
          { kind: 'list', items: [
            'Edit（编辑）会打开已预填该产品信息的产品编辑器，包括其图库和监管审批矩阵（参见“编辑产品”）。',
            'Disable（禁用）会对查看者隐藏该产品，但不删除任何内容。产品保留其 ACTIVE 或 DISCONTINUED 状态及全部数据；管理员仍能在目录和此视图中看到它，并标有 Disabled — hidden from the catalog（已禁用，已从目录隐藏）。',
            'Enable（启用）会将已禁用的产品原样放回目录。',
            'Disable 或 Enable 请求进行期间，按钮显示为 Disabling… 或 Enabling…，且在完成前无法关闭视图；随后会弹出提示确认结果。',
            '删除产品不在此处进行；Delete（删除）按钮位于编辑器底部。',
          ], labels: ['Edit', 'Disable', 'Enable', 'Disabled — hidden from the catalog'] },
          { kind: 'faq', items: [
            { q: '对于不再销售的产品，我应该禁用还是删除？', a: '如果该产品可能重新上架，或者您希望它继续出现在 Export CSV 和编辑器中，请使用 Disable：它只对查看者隐藏，Enable 可以恢复。编辑器中的 Delete 会将它从所有人的目录中移除，并且没有按钮可以恢复。请注意，在编辑器中把 Status 设为 DISCONTINUED 并不会隐藏产品：查看者仍然可以看到 DISCONTINUED 的产品。' },
            { q: '我禁用了一个产品，但仍然能看到它。', a: '这是正常的。管理员始终能看到已禁用的产品：在网格中以淡化显示并带有 DISABLED 标记，在此视图中带有 Disabled — hidden from the catalog 徽章。查看者则完全看不到它们。' },
          ], labels: ['Disable', 'Enable', 'DISABLED', 'Export CSV'] },
        ] },
      ],
    },
    {
      id: 'faq', heading: '常见问题',
      blocks: [
        { kind: 'faq', items: [
          { q: '我可以把某人直接链接到某个产品吗？', a: '可以。在详情视图中点击 Copy link，或在产品打开时复制地址栏；两者得到的都是 /?product=<slug>。对方必须登录 ProductPort，且该产品必须对其可见。' },
          { q: '我收到的链接打开后只有目录，没有产品。', a: '可能是该产品已被禁用（只有产品管理员能看到已禁用的产品）、处于 DRAFT 状态（任何人都无法打开），或者链接中的 slug 有误。如果您先被转到了登录页面，请登录后再重新打开链接。' },
          { q: '型号、证书编号或业务板块在哪里？', a: '详情视图不显示它们。型号、适用科室、业务板块、开发状态、分类、生命周期状态（ACTIVE 或 DISCONTINUED）以及各市场的证书编号、限定条件和备注都保存在产品记录中并包含在 CSV 导出里，但屏幕上只显示上文所述的字段。' },
          { q: '为什么有的产品显示临床证据表格，有的没有？', a: 'Key clinical evidence 只在该产品记录了试验时才显示，而试验无法通过 ProductPort 添加。' },
          { q: '顶部区域显示的市场比表格少，为什么？', a: '顶部的状态标签只显示有有效状态（已获批、进行中或已提交）的市场。Regulatory status by market 表格始终列出全部五个市场，包括 Not cleared（未获批）和未记录的市场。' },
        ], labels: ['Copy link', 'Regulatory status by market', 'Not cleared', 'Key clinical evidence'] },
      ],
    },
  ],
  related: ['catalog-browse', 'product-edit', 'login'],
};

export default productDetail;
