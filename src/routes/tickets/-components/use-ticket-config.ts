import { useCallback, useEffect, useMemo, useState } from "react";
import { apiClient, errorMessage } from "#/lib/api/client";
import { STATUS_CATEGORIES, type TicketConfig, type TicketType, type Workflow } from "../../../../shared/tickets";

/** Workflows and ticket types (admin-defined), with lookups by id. */
export function useTicketConfig(userId: string | undefined) {
	const [config, setConfig] = useState<TicketConfig>({ workflows: [], types: [] });
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const reload = useCallback(async () => {
		if (!userId) return;
		try {
			setConfig(await apiClient.get<TicketConfig>("/api/ticket-config"));
			setError(null);
		} catch (e) {
			setError(errorMessage(e));
		} finally {
			setLoading(false);
		}
	}, [userId]);

	useEffect(() => {
		reload();
	}, [reload]);

	const lookups = useMemo(() => {
		const workflowById = new Map<string, Workflow>(config.workflows.map((w) => [w.id, w]));
		const typeById = new Map<string, TicketType>(config.types.map((t) => [t.id, t]));
		return {
			/** What statuses can mean (fixed): groups the "All types" board. */
			stages: STATUS_CATEGORIES,
			workflowById,
			typeById,
			/** Workflow of a ticket type. */
			workflowOf: (typeId: string) => workflowById.get(typeById.get(typeId)?.workflowId ?? ""),
		};
	}, [config]);

	return { ...config, ...lookups, loading, error, reload };
}
