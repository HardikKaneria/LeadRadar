import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ValidationError } from '@radar/core';
import { CurrentUser, type RequestPrincipal } from '../../common/decorators/current-user.decorator';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard';
import { ExternalProviderAdminService } from '../lead-hunting/external-provider-admin.service';

@UseGuards(PlatformAdminGuard)
@Controller('admin/external')
export class AdminExternalProvidersController {
  constructor(private readonly providers: ExternalProviderAdminService) {}

  private auditOrgOf(user: RequestPrincipal): string {
    if (!user.organizationId) {
      throw new ValidationError('Missing x-organization-id header');
    }
    return user.organizationId;
  }

  @Get('providers')
  listAccounts() {
    return this.providers.listAccounts();
  }

  @Post('providers')
  createAccount(@CurrentUser() user: RequestPrincipal, @Body() body: Record<string, unknown>) {
    return this.providers.createAccount(this.auditOrgOf(user), user.userId, body as never);
  }

  @Patch('providers/:id')
  updateAccount(
    @CurrentUser() user: RequestPrincipal,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.providers.updateAccount(this.auditOrgOf(user), user.userId, id, body as never);
  }

  @Delete('providers/:id')
  deleteAccount(@CurrentUser() user: RequestPrincipal, @Param('id') id: string) {
    return this.providers.deleteAccount(this.auditOrgOf(user), user.userId, id);
  }

  @Get('plans')
  listPlans() {
    return this.providers.listPlans();
  }

  @Post('plans')
  createPlan(@CurrentUser() user: RequestPrincipal, @Body() body: Record<string, unknown>) {
    return this.providers.createPlan(this.auditOrgOf(user), user.userId, body as never);
  }

  @Patch('plans/:id')
  updatePlan(
    @CurrentUser() user: RequestPrincipal,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.providers.updatePlan(this.auditOrgOf(user), user.userId, id, body as never);
  }

  @Get('api-keys')
  listKeys() {
    return this.providers.listKeys();
  }

  @Post('api-keys')
  createKey(@CurrentUser() user: RequestPrincipal, @Body() body: Record<string, unknown>) {
    return this.providers.createKey(this.auditOrgOf(user), user.userId, body as never);
  }

  @Patch('api-keys/:id')
  updateKey(
    @CurrentUser() user: RequestPrincipal,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.providers.updateKey(this.auditOrgOf(user), user.userId, id, body as never);
  }

  @Delete('api-keys/:id')
  deleteKey(@CurrentUser() user: RequestPrincipal, @Param('id') id: string) {
    return this.providers.deleteKey(this.auditOrgOf(user), user.userId, id);
  }

  @Post('api-keys/:id/test')
  testKey(
    @CurrentUser() user: RequestPrincipal,
    @Param('id') id: string,
    @Body() body: { taskType?: string; testPayload?: unknown; timeoutMs?: number } = {},
  ) {
    return this.providers.testKey(this.auditOrgOf(user), user.userId, id, body);
  }

  @Get('routes')
  listRoutes() {
    return this.providers.listRoutes();
  }

  @Post('routes')
  createRoute(@CurrentUser() user: RequestPrincipal, @Body() body: Record<string, unknown>) {
    return this.providers.createRoute(this.auditOrgOf(user), user.userId, body as never);
  }

  @Patch('routes/:taskType')
  updateRoute(
    @CurrentUser() user: RequestPrincipal,
    @Param('taskType') taskType: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.providers.updateRoute(this.auditOrgOf(user), user.userId, taskType, body as never);
  }

  @Get('usage/summary')
  usageSummary(
    @Query('period') period?: string,
    @Query('organizationId') organizationId?: string,
  ) {
    return this.providers.getUsageSummary(period, organizationId);
  }

  @Get('usage/forecast')
  usageForecast(
    @Query('period') period?: string,
    @Query('organizationId') organizationId?: string,
  ) {
    return this.providers.getUsageForecast(period, organizationId);
  }

  @Get('usage/events')
  usageEvents(
    @Query('period') period?: string,
    @Query('organizationId') organizationId?: string,
    @Query('limit') limit?: string,
  ) {
    const parsed = Number.parseInt(limit ?? '', 10);
    return this.providers.listUsageEvents({
      period,
      organizationId,
      limit: Number.isFinite(parsed) ? parsed : undefined,
    });
  }

  @Get('usage/snapshots')
  usageSnapshots(
    @Query('limit') limit?: string,
    @Query('periodType') periodType?: 'daily' | 'weekly' | 'monthly' | 'trial' | 'custom',
  ) {
    const parsed = Number.parseInt(limit ?? '', 10);
    return this.providers.listSnapshots({
      limit: Number.isFinite(parsed) ? parsed : undefined,
      periodType,
    });
  }

  @Post('usage/recalculate')
  recalculateUsage(
    @CurrentUser() user: RequestPrincipal,
    @Body() body: { providerAccountId?: string; apiKeyId?: string },
  ) {
    return this.providers.recalculateUsage(this.auditOrgOf(user), user.userId, body);
  }

  @Post('usage/reconcile')
  reconcileUsage(@CurrentUser() user: RequestPrincipal, @Body() body: Record<string, unknown>) {
    return this.providers.reconcileUsage(this.auditOrgOf(user), user.userId, body as never);
  }

  @Post('usage/sync')
  syncUsage(@CurrentUser() user: RequestPrincipal) {
    return this.providers.syncUsage(this.auditOrgOf(user), user.userId);
  }

  @Post('usage/reset-check')
  runResetCheck(@CurrentUser() user: RequestPrincipal) {
    return this.providers.runResetCheck(this.auditOrgOf(user), user.userId);
  }

  @Get('health')
  health(@Query('limit') limit?: string) {
    const parsed = Number.parseInt(limit ?? '', 10);
    return this.providers.listHealth(Number.isFinite(parsed) ? parsed : 100);
  }

  @Get('alerts')
  alerts(@Query('limit') limit?: string) {
    const parsed = Number.parseInt(limit ?? '', 10);
    return this.providers.listAlerts(Number.isFinite(parsed) ? parsed : undefined);
  }

  @Patch('alerts/:id/acknowledge')
  acknowledgeAlert(@CurrentUser() user: RequestPrincipal, @Param('id') id: string) {
    return this.providers.acknowledgeAlert(this.auditOrgOf(user), user.userId, id);
  }

  @Get('test-runs')
  testRuns(@Query('limit') limit?: string) {
    const parsed = Number.parseInt(limit ?? '', 10);
    return this.providers.listTestRuns(Number.isFinite(parsed) ? parsed : undefined);
  }

  @Get('reconciliations')
  reconciliations(@Query('limit') limit?: string) {
    const parsed = Number.parseInt(limit ?? '', 10);
    return this.providers.listReconciliations(Number.isFinite(parsed) ? parsed : undefined);
  }

  // ── P10-14: Cost Rules ────────────────────────────────────────────────────

  @Get('cost-rules')
  listCostRules(
    @Query('provider') provider?: string,
    @Query('taskType') taskType?: string,
    @Query('isActive') isActive?: string,
  ) {
    const active = isActive === undefined ? undefined : isActive !== 'false';
    return this.providers.listCostRules({ provider, taskType, isActive: active });
  }

  @Get('cost-rules/:id')
  getCostRule(@Param('id') id: string) {
    return this.providers.getCostRule(id);
  }

  @Post('cost-rules')
  createCostRule(@Body() body: Record<string, unknown>) {
    return this.providers.createCostRule(body as never);
  }

  @Patch('cost-rules/:id')
  updateCostRule(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.providers.updateCostRule(id, body as never);
  }

  @Delete('cost-rules/:id')
  deleteCostRule(@Param('id') id: string) {
    return this.providers.deleteCostRule(id);
  }

  // ── P10-14: Option Multipliers ────────────────────────────────────────────

  @Get('option-multipliers')
  listOptionMultipliers(
    @Query('provider') provider?: string,
    @Query('isActive') isActive?: string,
  ) {
    const active = isActive === undefined ? undefined : isActive !== 'false';
    return this.providers.listOptionMultipliers({ provider, isActive: active });
  }

  @Post('option-multipliers')
  upsertOptionMultiplier(@Body() body: Record<string, unknown>) {
    return this.providers.upsertOptionMultiplier(body as never);
  }

  @Delete('option-multipliers/:id')
  deleteOptionMultiplier(@Param('id') id: string) {
    return this.providers.deleteOptionMultiplier(id);
  }

  // ── P10-14: Endpoint Catalog ──────────────────────────────────────────────

  @Get('endpoint-catalog')
  listEndpointCatalog(
    @Query('provider') provider?: string,
    @Query('isActive') isActive?: string,
  ) {
    const active = isActive === undefined ? undefined : isActive !== 'false';
    return this.providers.listEndpointCatalog({ provider, isActive: active });
  }

  @Post('endpoint-catalog')
  upsertEndpointCatalog(@Body() body: Record<string, unknown>) {
    return this.providers.upsertEndpointCatalog(body as never);
  }

  @Delete('endpoint-catalog/:id')
  deleteEndpointEntry(@Param('id') id: string) {
    return this.providers.deleteEndpointEntry(id);
  }

  // ── P10-14: Cost Simulator ────────────────────────────────────────────────

  @Post('cost-simulator')
  runCostSimulator(@Body() body: Record<string, unknown>) {
    return this.providers.runCostSimulator(body as never);
  }

  // ── P10-14: Cost Adjustments ──────────────────────────────────────────────

  @Get('cost-adjustments')
  listCostAdjustments(
    @Query('provider') provider?: string,
    @Query('apiKeyId') apiKeyId?: string,
  ) {
    return this.providers.listCostAdjustments({ provider, apiKeyId });
  }

  @Post('cost-adjustments')
  createCostAdjustment(@CurrentUser() user: RequestPrincipal, @Body() body: Record<string, unknown>) {
    return this.providers.createCostAdjustment(body as never, user.userId);
  }
}
