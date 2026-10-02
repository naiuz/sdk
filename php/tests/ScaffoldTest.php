<?php

declare(strict_types=1);

namespace Naiuz\Tests;

use Naiuz\NeuronAI;
use Naiuz\Tests\Contract\Harness;

final class ScaffoldTest extends TestCase
{
    private const PHP_DIR = __DIR__ . '/..';

    public function test_the_version_is_a_semantic_version(): void
    {
        self::assertMatchesRegularExpression('/^\d+\.\d+\.\d+$/', NeuronAI::VERSION);
    }

    public function test_the_runtime_dependencies_are_the_psr_interfaces_and_discovery_only(): void
    {
        $composer = self::composer();
        self::assertSame(
            ['php' => '^8.2', 'php-http/discovery' => '^1.20', 'psr/http-client' => '^1.0', 'psr/http-factory' => '^1.1'],
            $composer['require'],
        );
        self::assertIsArray($composer['suggest']);
        self::assertSame(['guzzlehttp/guzzle'], array_keys($composer['suggest']));
    }

    public function test_the_namespace_naiuz_loads_from_src(): void
    {
        $autoload = self::composer()['autoload'];
        self::assertSame(['psr-4' => ['Naiuz\\' => 'src/']], $autoload);
    }

    public function test_the_license_is_the_repository_s(): void
    {
        self::assertFileEquals(self::PHP_DIR . '/../LICENSE', self::PHP_DIR . '/LICENSE');
    }

    public function test_a_packagist_download_holds_the_library_and_leaves_out_the_tests_and_tools(): void
    {
        $ignored = ['.gitattributes', '.gitignore', '.php-cs-fixer.dist.php', 'composer.lock', 'examples', 'phpstan.neon.dist', 'phpunit.xml.dist', 'smoke', 'tests'];
        $kept = ['LICENSE', 'README.md', 'api.md', 'composer.json', 'src'];
        $process = proc_open(['git', '-C', self::PHP_DIR, 'check-attr', 'export-ignore', '--', ...$ignored, ...$kept], [1 => ['pipe', 'w']], $pipes);
        self::assertIsResource($process);
        $output = stream_get_contents($pipes[1]);
        fclose($pipes[1]);
        self::assertSame(0, proc_close($process));
        $expected = array_merge(
            array_map(static fn(string $path): string => "{$path}: export-ignore: set", $ignored),
            array_map(static fn(string $path): string => "{$path}: export-ignore: unspecified", $kept),
        );
        self::assertSame($expected, explode("\n", trim((string) $output)));
    }

    public function test_the_readme_names_every_resource_and_links_the_reference_and_the_examples(): void
    {
        $readme = (string) file_get_contents(self::PHP_DIR . '/README.md');
        self::assertStringStartsWith("# NeuronAI PHP SDK\n", $readme);
        foreach (['tts', 'tts->jobs', 'voices', 'stt', 'chat->completions', 'models', 'embeddings', 'rerank', 'account', 'apiKeys'] as $resource) {
            self::assertStringContainsString("| `\$client->{$resource}` |", $readme);
        }
        self::assertStringContainsString('[api.md](api.md)', $readme);
        self::assertStringContainsString('[examples/](examples)', $readme);
    }

    public function test_the_api_reference_lists_every_method(): void
    {
        $reference = (string) file_get_contents(self::PHP_DIR . '/api.md');
        foreach (Harness::phpPaths() as $path) {
            self::assertStringContainsString("### `{$path}(", $reference, $path);
        }
    }

    public function test_the_examples_are_the_eight_every_sdk_ships(): void
    {
        $examples = array_map(basename(...), glob(self::PHP_DIR . '/examples/*.php') ?: []);
        sort($examples);
        self::assertSame(['api-keys.php', 'async-job.php', 'clone-voice.php', 'dialogue.php', 'embeddings-rerank.php', 'stream-chat.php', 'synthesize.php', 'transcribe.php'], $examples);
    }

    /** @return array<string, mixed> */
    private static function composer(): array
    {
        $composer = json_decode((string) file_get_contents(self::PHP_DIR . '/composer.json'), true, flags: JSON_THROW_ON_ERROR);
        self::assertIsArray($composer);

        /** @var array<string, mixed> $composer */
        return $composer;
    }
}
