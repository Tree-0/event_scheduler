import protobuf from 'protobufjs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Plugin } from 'vite';

// OR-Tools retains protobuf reflection metadata for exact int64 conversion, but
// its lazy codecs use Function(), which MV3 disallows. Emit the same codecs as
// ordinary JavaScript at build time and attach them to the reflected types.
export function staticCodecs(schema: string, name: string): string {
  const root = protobuf.parse(schema).root.resolveAll();
  const types: protobuf.Type[] = [];
  const collect = (namespace: protobuf.NamespaceBase) => {
    if (namespace instanceof protobuf.Type) types.push(namespace);
    for (const child of namespace.nestedArray) if (child instanceof protobuf.Namespace) collect(child);
  };
  collect(root);
  return `function ${name}(root, pb) {
    const Writer = pb.Writer, Reader = pb.Reader, util = pb.util;
    root.resolveAll();
    ${types.map(type => `{
      const type = root.lookupType(${JSON.stringify(type.fullName)});
      const types = type.fieldsArray.map(field => field.resolve().resolvedType);
      const C = ${protobuf.Type.generateConstructor(type).toString()};
      type.ctor = C;
      type.encode = ${protobuf.encoder(type).toString()};
      type.decode = ${protobuf.decoder(type).toString()};
      type.verify = ${protobuf.verifier(type).toString()};
      type.fromObject = ${protobuf.converter.fromObject(type).toString()};
      type.toObject = ${protobuf.converter.toObject(type).toString()};
      type.setup = function() { return this; };
    }`).join('\n')}
    return root;
  }`;
}

export function staticSolverProtobuf(): Plugin {
  let generated: Promise<string> | undefined;
  return { name: 'static-solver-protobuf', enforce: 'pre', async transform(code, id) {
    if (!id.replaceAll('\\', '/').split('?')[0].endsWith('/or-tools-wasm/build/javascript/browser/cp-sat.js')) return;
    generated ??= (async () => {
      const schemas = await import(/* @vite-ignore */ pathToFileURL(resolve('node_modules/or-tools-wasm/build/javascript/browser/generated/cp_sat_schemas.js')).href);
      return staticCodecs(schemas.cpModelProtoSchema, 'installModelCodecs') + '\n' + staticCodecs(schemas.satParametersProtoSchema, 'installParameterCodecs');
    })();
    const context = 'modelRoot = protobufModule2.parse(schemas.cp_model).root, parametersRoot = protobufModule2.parse(schemas.sat_parameters).root;';
    if (!code.includes(context)) throw new Error('OR-Tools protobuf context changed; review static codec integration.');
    code = code.replace(context, 'modelRoot = installModelCodecs(protobufModule2.parse(schemas.cp_model).root, protobufModule2), parametersRoot = installParameterCodecs(protobufModule2.parse(schemas.sat_parameters).root, protobufModule2);');
    const start = code.indexOf('// node_modules/protobufjs/src/util/codegen.js');
    const end = code.indexOf('// (disabled):fs', start);
    if (start < 0 || end < 0) throw new Error('OR-Tools protobuf code generator changed; review MV3 compatibility.');
    // Fail closed if a new path requests an uncompiled codec; never evaluate code.
    code = code.slice(0, start) + `var require_codegen = __commonJS({
      "protobuf-static-only"(exports, module) {
        module.exports = function() { throw new Error("A solver protobuf codec was not compiled. Rebuild the extension."); };
      }
    });\n` + code.slice(end);
    return code + '\n' + await generated;
  } };
}
