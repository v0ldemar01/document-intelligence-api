import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { LangFlowApiService, FlowDefinition } from './langflow-api.service';
import { DatabaseService } from '../database/database.service';

const FLOW_DEFINITION_PATH = join(
  process.cwd(),
  'langflow',
  'flows',
  'invoice-extraction.json',
);
const CATALOG_FLOW_NAME = 'invoice-flow';
const PLACEHOLDER_FLOW_ID = 'mock-invoice-flow';

@Injectable()
class LangFlowSetupService implements OnApplicationBootstrap {
  private readonly logger = new Logger(LangFlowSetupService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly langflowApi: LangFlowApiService,
    private readonly databaseService: DatabaseService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (this.config.get<string>('extraction.engine') !== 'langflow') return;

    const overrideFlowId = this.config.get<string>('langflow.flowId');
    if (overrideFlowId) {
      this.logger.log(`Using LANGFLOW_FLOW_ID from env: ${overrideFlowId}`);
      await this.patchCatalogFlowId(overrideFlowId);
      return;
    }

    const existingId = await this.getCatalogFlowId();
    if (existingId) {
      this.logger.log(
        `LangFlow flow already configured (${existingId}) — skipping setup`,
      );
      return;
    }

    // Step 4: auto-create from definition file.
    if (!(await this.langflowApi.isReachable())) {
      this.logger.warn(
        'LangFlow is not reachable — skipping automatic flow setup',
      );
      return;
    }

    const definition = await this.loadFlowDefinition();
    if (!definition) {
      this.logger.warn(
        `No flow definition found at ${FLOW_DEFINITION_PATH}. ` +
          'Export your flow from LangFlow UI and save it there, or set LANGFLOW_FLOW_ID in .env.',
      );
      return;
    }

    const { flowId, created } =
      await this.langflowApi.findOrCreateFlow(definition);
    this.logger.log(
      `LangFlow flow "${definition.name}" ${created ? 'created' : 'found'} — ID: ${flowId}`,
    );
    await this.patchCatalogFlowId(flowId);
    this.logger.log(`DB catalog updated with langflowFlowId: ${flowId}`);
  }

  /**
   * Returns the current langflowFlowId from the catalog, or null if it is
   * unset or still holds the default placeholder value.
   */
  private async getCatalogFlowId(): Promise<string | null> {
    const flow = await this.databaseService.flow.findFirst({
      where: { name: CATALOG_FLOW_NAME },
      select: { langflowFlowId: true },
    });
    const id = flow?.langflowFlowId ?? null;
    return id && id !== PLACEHOLDER_FLOW_ID ? id : null;
  }

  private async patchCatalogFlowId(flowId: string): Promise<void> {
    await this.databaseService.flow.updateMany({
      where: { name: CATALOG_FLOW_NAME },
      data: { langflowFlowId: flowId },
    });
  }

  private async loadFlowDefinition(): Promise<FlowDefinition | null> {
    try {
      const raw = await readFile(FLOW_DEFINITION_PATH, 'utf-8');
      return JSON.parse(raw) as FlowDefinition;
    } catch {
      return null;
    }
  }
}

export { LangFlowSetupService };
