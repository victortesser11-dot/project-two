const FUNCOES = [
  'Pedreiro', 'Servente', 'Carpinteiro', 'Armador', 'Eletricista', 'Encanador', 'Pintor', 'Gesseiro',
  'Azulejista', 'Mestre de obras', 'Encarregado', 'Operador de máquina', 'Motorista', 'Técnico de segurança',
];

/** Sugestões de função para os campos com list="funcoes-obra". */
export function FuncoesObra() {
  return (
    <datalist id="funcoes-obra">
      {FUNCOES.map((f) => (
        <option key={f} value={f} />
      ))}
    </datalist>
  );
}
