import type { HelpArticleContent } from '@matthewdbaldwin/microport-ui/help/logic';

const catalogBrowse: HelpArticleContent = {
  slug:  'catalog-browse',
  title: '浏览和筛选产品目录',
  intro: '目录页面会一次性加载整个产品目录，之后的搜索和筛选都在您的浏览器中即时完成。所有已登录的员工都可以浏览目录；产品管理员还会在顶部栏看到目录管理按钮。',
  lastUpdated: '2026-09-04',
  sections: [
    {
      id: 'page-layout', heading: '目录页面概览',
      blocks: [
        { kind: 'list', items: [
          '顶部栏：搜索框、一个绿色状态标签（显示已加载的产品数量，加载完成前显示 Loading…）、应用切换器和“个人资料”按钮。',
          '筛选栏：Therapeutic area（治疗领域）、Subsidiary（子公司）、Regulatory（监管）和 Category（类别），按此顺序排列。',
          '筛选栏下方的计数行：N shown · M in catalog（已显示 N 个 · 目录共 M 个）。M 是整个目录的产品数；N 是当前搜索和筛选匹配到的数量。',
          '产品网格：每个产品一张卡片，按名称排序。没有分页，也没有排序控件；整个目录都在同一页上。',
        ], labels: ['Loading…', 'in catalog'] },
        { kind: 'paragraph', text: '列表加载期间页面显示 Loading catalog…。如果页面显示 Could not load the catalog. Please refresh.，说明产品列表未能加载；请重新加载页面。如果您尚未登录，页面会转到登录流程。', labels: ['Loading catalog…', 'Could not load the catalog'] },
      ],
    },
    {
      id: 'search', heading: '搜索',
      blocks: [
        { kind: 'paragraph', text: '在搜索框中输入即可随输入即时筛选；没有搜索按钮，也不需要按 Enter 键。匹配不区分大小写，会在产品的名称、标语、适应症、类别、类型或子公司中查找您输入的文字。Clear filters（清除筛选）会清空搜索框以及所有生效中的筛选。', labels: ['Search products, indications, types…', 'Clear filters'] },
        { kind: 'list', items: [
          '搜索不会查看产品概述或功能列表。',
          '搜索不会查看规格或患者人群。',
          '搜索不会匹配型号、证书编号或监管备注。',
        ] },
      ],
    },
    {
      id: 'filters', heading: '筛选',
      blocks: [
        { kind: 'list', items: [
          'Therapeutic area（治疗领域）：目录中出现的每个治疗领域各有一个筛选标签，并标有数量。点击标签即可选中；再次点击已选中的标签即可取消。',
          'Subsidiary（子公司）：一个默认折叠的面板，在您选择之前，其标题显示为 All subsidiaries。展开后可从其中的标签里选择一家子公司；再次点击已选中的标签即可取消。',
          'Regulatory（监管）：五个标签，即 CE、FDA、NMPA、PMDA 和 TGA。同一时间只能选中一个。',
          'Category（类别）：一个下拉菜单，默认为 All categories，列出每个类别及其产品数量。',
        ], labels: ['Therapeutic area', 'Subsidiary', 'Regulatory', 'Category', 'All subsidiaries'] },
        { kind: 'paragraph', text: '在 Regulatory 下选择一个市场后，会保留在该市场中已获批、进行中或已提交的产品；这是“在该市场中存在”的筛选，而不是“仅已获批”的筛选。标签旁边的图例显示三种状态标签的颜色：Cleared（已获批）、In progress（进行中）和 Submitted（已提交）。', labels: ['Cleared', 'In progress', 'Submitted'] },
        { kind: 'paragraph', text: '筛选条件与搜索框会同时生效：产品必须满足每一个生效中的条件。标签和下拉选项上的数量始终是整个目录的数量，不会随着您添加其他筛选而减少；筛选栏下方的那一行才反映您当前组合的结果。只有在有筛选或搜索生效时，Clear filters 才会出现，它会重置所有条件，包括搜索框。筛选条件不会保存在地址栏中，因此刷新页面或分享链接都会从完整目录开始。没有任何匹配项时，网格只是显示为空，计数行显示 0 shown · M in catalog；没有单独的“无结果”提示。', labels: ['Clear filters', 'All categories', 'in catalog'] },
      ],
    },
    {
      id: 'cards', heading: '读懂产品卡片',
      blocks: [
        { kind: 'list', items: [
          '缩略图：产品的主图；没有图片时显示带有产品名称的 MicroPort 占位图。',
          '治疗领域；如果产品设有等级，还会显示 Tier 1、Tier 2 或 Tier 3 徽章。',
          '产品名称和标语。',
          '子公司 · 类别。',
          '市场状态标签：每个有实际状态的市场各一个。单独的代码（例如 FDA）表示该产品在该市场已获批；代码后带一个圆点表示获批正在进行中或已提交。当没有任何市场处于已获批、进行中或已提交状态时，则显示 Status: see detail。',
        ], labels: ['Tier 1', 'Tier 2', 'Tier 3', 'Status: see detail'] },
        { kind: 'paragraph', text: '点击卡片即可打开产品的详情视图。详情打开期间，地址栏会附加 ?product=<slug>，因此可以将页面加入书签或分享；关于详情视图的内容以及如何复制链接，请参见“产品详情”。' },
      ],
    },
    {
      id: 'admin-actions', heading: '面向产品管理员',
      blocks: [
        { kind: 'roleBlock', roles: ['product_admin', 'superuser'], blocks: [
          { kind: 'list', items: [
            'Add product（添加产品）会打开一张空白的产品表单（参见“添加产品”）。',
            'Verify (dry run)（验证，试运行）会将 CSV 文件与目录进行比对，并报告导入将创建、更新或拒绝哪些内容，但不会写入任何数据。',
            'Import CSV（导入 CSV）会真正执行导入，完成后重新加载目录。',
            'Export CSV（导出 CSV）会将整个目录下载为 CSV 文件，包括已禁用和 DRAFT 状态的产品（参见“CSV 导入与导出”）。',
          ], labels: ['Add product', 'Verify (dry run)', 'Import CSV', 'Export CSV'] },
          { kind: 'paragraph', text: '管理员还能在网格中看到已禁用的产品，这些产品以淡化显示并带有红色的 DISABLED 标记；查看者（viewer）永远看不到它们，因此顶部栏中的产品数量在两种角色之间会有所不同。状态为 DRAFT 的产品对所有人隐藏（包括管理员），也无法从目录中打开；Export CSV 是 ProductPort 中唯一仍会列出它们的地方。', labels: ['DISABLED', 'Export CSV'] },
        ] },
      ],
    },
    {
      id: 'faq', heading: '常见问题',
      blocks: [
        { kind: 'faq', items: [
          { q: '搜索找不到我确定存在的产品，为什么？', a: '搜索只匹配产品的名称、标语、适应症、类别、类型和子公司，不匹配概述、规格、型号或证书编号。此外，生效中的 Therapeutic area、Subsidiary、Regulatory 或 Category 筛选也可能把名称匹配的产品隐藏起来；请先点击 Clear filters，再重新搜索。' },
          { q: '添加另一个筛选后，筛选标签上的数量为什么没有变化？', a: '这些数量始终描述整个目录，方便您了解每个分组的规模。筛选栏下方的那一行（N shown · M in catalog）才是您当前搜索和筛选组合的结果数。' },
          { q: '我刷新了页面，筛选条件不见了。', a: '筛选条件和搜索内容不会保存在地址栏或浏览器中，因此刷新后会从完整目录重新开始。只有产品链接（?product=…）在刷新后仍会保留。' },
          { q: '同事发给我一个链接，但打开后目录中什么都没有选中。', a: '该产品可能已被禁用（只有产品管理员能看到已禁用的产品），或者处于 DRAFT 状态（任何人都无法打开）。如果您先被转到了登录页面，请登录后再重新打开该链接。' },
          { q: '如何把某个产品分享给他人？', a: '打开该产品，在详情视图中点击 Copy link（复制链接），或在产品打开时直接复制地址栏；两者得到的都是同一个 ?product= 链接。接收者必须登录 ProductPort 才能查看。' },
          { q: '卡片上的 Status: see detail 是什么意思？', a: '表示该产品目前在五个市场中都没有处于已获批、进行中或已提交状态。打开产品即可查看完整的 Regulatory status by market（按市场划分的监管状态）表格，其中还会显示 Not cleared（未获批）和未记录的市场。' },
        ], labels: ['Clear filters', 'Copy link', 'Status: see detail', 'Regulatory status by market'] },
      ],
    },
  ],
  related: ['product-detail', 'login', 'csv-import'],
};

export default catalogBrowse;
