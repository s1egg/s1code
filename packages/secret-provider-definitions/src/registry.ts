import { makeSecretProviderDefinitionRegistry } from "@s1tools/secret-provider-core/shared/definition";
import * as OnePassword from "@s1tools/secret-provider-onepassword/shared/definition";

export const builtInSecretProviderDefinitions = makeSecretProviderDefinitionRegistry([
  OnePassword.definition,
]);
