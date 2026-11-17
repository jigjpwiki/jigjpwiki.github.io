# 業務UIのローカルデザインシステム

調査日2026-11-17。公式サイトの最新表示は **DADS β v2.18.2**。2026-10-21公開のMarkdown一式と以下のWeb/コード資料を参照。Figmaのコンポーネント編集やデザイン素材の転載は行わない。

## 参照と採用判断

| 領域 | 参照 | jigwikiの方針 |
| --- | --- | --- |
| 基本設計/カラー | [基本](https://design.digital.go.jp/dads/foundations/) / [色](https://design.digital.go.jp/dads/foundations/color/) | neutral背景、action青、error赤。色だけで状態を表さない。darkは独自の対応色と対比を検証 |
| 文字 | [Typography](https://design.digital.go.jp/dads/foundations/typography/) | OSの日本語sans、本文16px/line-height1.5、テーブル14〜16px、日時はtabular-nums。外部font接続なし |
| 余白 | [Spacing](https://design.digital.go.jp/dads/foundations/spacing/) | 8px基準、関連項目8/セクション24、細部4px。wide画面で余白を増やすためのmax-widthを付けない |
| 操作 | [Button](https://design.digital.go.jp/dads/components/button/) | 主/副/テキストを区別、small36px＋余白でtarget確保、mobile44px以上。focusを黄色＋黒で識別 |
| 入力 | [Input](https://design.digital.go.jp/dads/components/input-text/) / [Select](https://design.digital.go.jp/dads/components/select/) | labelは常時表示、readonly理由、任意/必須、説明/エラーをaria-describedby。未完成保存と公開検証を分離 |
| 検索選択 | [Combobox](https://design.digital.go.jp/dads/components/combobox/) | 選択支援型。任意テキストを固定IDとして確定しない。現native検索＋selectを維持し、後続で操作統一 |
| 選択 | [Checkbox](https://design.digital.go.jp/dads/components/checkbox/) | 行/全件の選択範囲・部分選択状態を明示。ラベルごと操作可能にする |
| 構造 | [Tab](https://design.digital.go.jp/dads/components/tab/) / [Navigation](https://design.digital.go.jp/dads/components/menu-list/) / [Breadcrumb](https://design.digital.go.jp/dads/components/breadcrumb/) | カテゴリはsidebar、編集内はtab、パンくずは現在位置。current/selectedをARIAで示す |
| 検証 | [Form labels](https://design.digital.go.jp/dads/components/form-control-label/) / [Notification](https://design.digital.go.jp/dads/components/notification-banner/) | エラー概要から該当欄へ、失敗時入力保持。save statusはrole=status、競合は上書き禁止 |
| 表 | [Table](https://design.digital.go.jp/dads/components/table/) / [Table control](https://design.digital.go.jp/dads/components/table-control/) | native tableを基本にセル編集仕様を別途設計。独自grid roleを無計画に付けない |
| アクセシビリティ | [方針](https://design.digital.go.jp/dads/webaccessibility/) / [指針](https://design.digital.go.jp/dads/guidance/accessibility/) | キーボード、明確なfocus、label、色以外の状態、200%拡大、mobile。DADSサイトのAA表明を本Adminの認証として流用しない |

## コード・Figma・ライセンス

- [HTML版](https://github.com/digital-go-jp/design-system-example-components-html): button/playground.html、checkbox/errored.html、global.cssを確認。native button、fieldset/legend、aria-invalid/aria-describedbyの用例。
- [React版](https://github.com/digital-go-jp/design-system-example-components-react): Button.tsxを確認。React19/Tailwindベースの実装。既存Adminを置き換えるruntime上の必要性はない。
- 両repoの**LICENSEはMIT、Copyright (c) 2025 デジタル庁**。実装コードを取り込む場合は該当LICENSEを同梱する。今回はスニペットのコピーやパッケージ導入は行わず、既存DOM部品を独自実装で改善する。
- [公式Figma Community](https://www.figma.com/community/file/1377880368787735577)は公式リソース一覧に掲載されるv2データ。取得には会員登録が必要。データ本体は未取得のため、Figma素材の利用許諾を推定せず、素材は利用しない。
- [公式リソース](https://design.digital.go.jp/dads/resources/)はHTML/React、Markdown一式、イラスト規約を区別。政府ロゴ・イラスト・フォントの再配布はしない。

## コンポーネントと段階

Phase 1: SaveIndicator/共通Workspace state、既存フォーム/ValidationMessageの保持。Phase 2: ChangeReview、Submission。Phase 3: AppShell、Sidebar、PageHeader、Toolbar、DataTable、InlineEditor、DetailPanel、SearchCombobox、DateTimeField、StatusIndicator、ConfirmationDialog、ToastをDOM modulesに分離。Phase 4: 全カテゴリ同じ挙動を検証。

表操作仕様（Phase 3）: Tabで操作要素へ、Enterで編集、Escapeでキャンセル、編集外の矢印はセル移動、編集中の矢印はnative入力動作。選択は明示checkbox、全件選択は現在filter範囲をラベルに示す。Ctrl/Cmd+Zはテキスト欄ではnativeUndo、表操作ではWorkspaceUndo。page50行、sticky header、列幅下限と可変name列、列非表示でも必須操作列を維持。未保存セルは背景＋印、保存された下書きとmain未反映を区別する。
