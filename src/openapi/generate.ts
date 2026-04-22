import { writeFileSync } from 'fs';
import { resolve } from 'path';
import { openAPIBase } from './openapi.base';
import { paths, components } from './schemas';

const spec = {
  ...openAPIBase,
  components: {
    ...openAPIBase.components,
    ...components,
  },
  paths,
};

const outputPath = resolve(process.cwd(), 'openapi.yaml');

// Write as JSON (rename .yaml for convention but use JSON — valid YAML superset)
writeFileSync(outputPath, JSON.stringify(spec, null, 2));
console.log(`✅ OpenAPI spec written to ${outputPath}`);
