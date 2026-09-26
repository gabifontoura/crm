/**
 * Release note as the What's New page sends and receives it (`/api/releases`).
 * `tipo`: "Novidade" new feature, "Melhoria" improvement, "Correção" fix.
 */
export interface ReleaseRecord {
	id: number;
	titulo: string;
	descricao: string;
	oQueMuda: string;
	passoAPasso: string[];
	videoEad?: string;
	imagens?: string[];
	data: string;
	hora: string;
	usuario: string;
	tipo: "Novidade" | "Melhoria" | "Correção";
	produto: string;
}
