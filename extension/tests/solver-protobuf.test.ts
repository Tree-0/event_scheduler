import { expect, test, vi } from 'vitest';
import protobuf from 'protobufjs';
import { runInNewContext } from 'node:vm';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { staticCodecs } from '../build/solver-protobuf';

const schemas = await import(pathToFileURL(resolve('node_modules/or-tools-wasm/build/javascript/browser/generated/cp_sat_schemas.js')).href);

test.each([
  ['cpModelProtoSchema', 'CpModelProto', {
    variables: [{ name: 'start', domain: ['0', '120'] }, { name: 'chosen', domain: ['0', '1'] }],
    constraints: [
      { exactlyOne: { literals: [1] } },
      { enforcementLiteral: [1], interval: { start: { vars: [0], coeffs: ['5'], offset: '-10' }, size: { offset: '37' }, end: { vars: [0], coeffs: ['5'], offset: '27' } } },
      { noOverlap: { intervals: [1] } },
      { linear: { vars: [0], coeffs: ['-1'], domain: ['-9223372036854775808', '9223372036854775807'] } },
    ],
    objective: { vars: [0], coeffs: ['1'], scalingFactor: 1 },
  }],
  ['cpModelProtoSchema', 'CpSolverResponse', { status: 'OPTIMAL', solution: ['9223372036854775807', '-9223372036854775808', '3'], objectiveValue: 60, wallTime: 0.01 }],
  ['satParametersProtoSchema', 'SatParameters', { maxTimeInSeconds: 10, randomSeed: 0, subsolverParams: [{ name: 'nested', numWorkers: 1 }] }],
])('static %s / %s codecs match protobuf with runtime code generation disabled', (schemaName, typeName, value) => {
  const schema = schemas[schemaName];
  const reference = protobuf.parse(schema).root.lookupType(`operations_research.sat.${typeName}`);
  const referenceMessage = reference.fromObject(value);
  const bytes = reference.encode(referenceMessage).finish();
  const expected = reference.toObject(reference.decode(bytes), { longs: String, enums: String, defaults: true, arrays: true, objects: true });
  const source = staticCodecs(schema, 'install');
  const root = protobuf.parse(schema).root;
  const codegen = vi.spyOn(protobuf.util, 'codegen').mockImplementation(() => { throw new Error('Runtime code generation is disabled'); });
  try {
    runInNewContext(`${source}; install(root, pb);`, { root, pb: protobuf, String, Number }, { contextCodeGeneration: { strings: false, wasm: false } });
    const type = root.lookupType(`operations_research.sat.${typeName}`);
    const message = type.fromObject(value);
    expect(type.verify(message)).toBeNull();
    expect(type.encode(message).finish()).toEqual(bytes);
    expect(type.toObject(type.decode(bytes), { longs: String, enums: String, defaults: true, arrays: true, objects: true })).toEqual(expected);
    expect(codegen).not.toHaveBeenCalled();
  } finally { codegen.mockRestore(); }
});
