import type { SoldUnit } from "../../shared/billing.js";
import type { Ticket } from "../../shared/tickets.js";
import type { Repos } from "../repos/types.js";

/** The development, block and unit the deal is about, with their names. */
export async function soldUnitOf(repos: Repos, ticket: Pick<Ticket, "developmentId" | "blockId" | "unitId" | "property">): Promise<SoldUnit> {
	const dev = ticket.developmentId ? await repos.developments.get(ticket.developmentId) : null;
	const block = ticket.blockId ? await repos.blocks.get(ticket.blockId) : null;
	const unit = ticket.unitId ? await repos.units.get(ticket.unitId) : null;
	return {
		developmentId: ticket.developmentId ?? null,
		development: dev?.name ?? ticket.property ?? "",
		blockId: ticket.blockId ?? null,
		block: block?.name ?? "",
		unitId: ticket.unitId ?? null,
		unit: unit?.number ?? "",
	};
}
