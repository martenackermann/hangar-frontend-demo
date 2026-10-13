import type {
  ArticleRow,
  ArticleSiteSettingRow,
  AssetMovementRow,
  AssetRow,
  BookingCalendarRow,
  ContactRow,
  DeviationCodeRow,
  LeaseReturnCommentRow,
  LeaseReturnRow,
  RegionRow,
  RegionRuleRow,
  SavedViewRow,
  ServiceRequestItemRow,
  ServiceRequestRow,
  SiteRow,
  StatusTransitionRow,
  StockLocationRow,
  UserRow,
  VipEntryRow,
} from '@/mocks/fixtures/types'

/**
 * Core tables of the demo database (SPEC §5.1), loaded from `seed.json`. Slices read them
 * through `db.collection('<table>')` and change them through the workflow engine
 * (`applyAction`) or the core helpers (`moveAsset`, `setAppointment`, …) — never by
 * re-defining them.
 */
declare module '@/mocks/db' {
  interface DemoCollections {
    users: UserRow
    saved_views: SavedViewRow
    contacts: ContactRow
    vip_entries: VipEntryRow
    sites: SiteRow
    regions: RegionRow
    region_rules: RegionRuleRow
    stock_locations: StockLocationRow
    articles: ArticleRow
    article_site_settings: ArticleSiteSettingRow
    assets: AssetRow
    asset_movements: AssetMovementRow
    service_requests: ServiceRequestRow
    service_request_items: ServiceRequestItemRow
    lease_returns: LeaseReturnRow
    lease_return_comments: LeaseReturnCommentRow
    status_transitions: StatusTransitionRow
    deviation_codes: DeviationCodeRow
    booking_calendars: BookingCalendarRow
  }
}

export type {
  ArticleRow,
  ArticleSiteSettingRow,
  AssetMovementRow,
  AssetRow,
  BookingCalendarRow,
  ContactRow,
  DeviationCodeRow,
  LeaseReturnCommentRow,
  LeaseReturnRow,
  RegionRow,
  RegionRuleRow,
  SavedViewRow,
  ServiceRequestItemRow,
  ServiceRequestRow,
  SiteRow,
  StatusTransitionRow,
  StockLocationRow,
  UserRow,
  VipEntryRow,
}
