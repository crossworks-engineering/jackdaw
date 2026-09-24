export * from '@mantle/client-types/types/maintenance';

import type * as Contract from '@mantle/client-types/types/maintenance';

// Contract-next: mantle v0.232.239 adds the fields below to the published
// contract. Until the pin carries them, these local declarations shadow the
// star export above. Remove them (keep the star export) after the pin bump.

/** A value the UI runner asks for and passes to the script as
 *  `--<name>=<value>`: the agent a dry run works on, the review page an apply
 *  reads. `for` says which run needs it. */
export interface MaintenanceArg {
  name: string;
  kind: 'agent' | 'page';
  label: string;
  for: 'dry' | 'apply';
}

export type MaintenanceTaskInfo = Contract.MaintenanceTaskInfo & {
  /** Values the UI must collect before a run. */
  args?: MaintenanceArg[];
  /** What a DRY run spends when it is not free: the UI asks to confirm it. */
  dryRunCost?: Contract.TaskCost;
};

export type StartRunRequest = Contract.StartRunRequest & {
  /** Values for the task's `args`, keyed by MaintenanceArg.name. */
  args?: Record<string, string>;
};

export type MaintenanceOverview = Omit<Contract.MaintenanceOverview, 'tasks'> & {
  tasks: MaintenanceTaskInfo[];
};
