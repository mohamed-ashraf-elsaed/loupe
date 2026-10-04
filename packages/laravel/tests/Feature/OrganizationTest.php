<?php

namespace Loupekit\Loupe\Tests\Feature;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Loupekit\Loupe\Support\Hub;
use Loupekit\Loupe\Tests\TestCase;

class OrganizationTest extends TestCase
{
    private const SECRET = 'psk_shop';

    private function enableHub(): void
    {
        config()->set('loupe.hub.url', 'https://hub.test/');
        config()->set('loupe.hub.project_id', 'prj_shop');
        config()->set('loupe.hub.project_secret', self::SECRET);
    }

    private function hubAnswer(): array
    {
        return [
            'organization' => ['id' => 'org_1', 'name' => 'Acme'],
            'project' => ['id' => 'prj_shop', 'name' => 'Shop', 'destination' => ['id' => 'prj_crm', 'name' => 'CRM'], 'receives' => false],
            'projects' => [
                ['id' => 'prj_crm', 'name' => 'CRM', 'receives' => true, 'isDestination' => true],
                ['id' => 'prj_pay', 'name' => 'Pay', 'receives' => false, 'isDestination' => false],
                'junk',
            ],
        ];
    }

    public function test_it_returns_the_organization_from_hub_signed_and_cached(): void
    {
        $this->enableHub();
        Http::fake(['hub.test/*' => Http::response($this->hubAnswer())]);
        $this->actingAsAllowed();

        $expected = [
            'organization' => ['id' => 'org_1', 'name' => 'Acme'],
            'project' => ['key' => 'app', 'id' => 'prj_shop', 'name' => 'Shop', 'destination' => ['id' => 'prj_crm', 'name' => 'CRM'], 'receives' => false],
            'projects' => [
                ['id' => 'prj_crm', 'name' => 'CRM', 'receives' => true, 'isDestination' => true],
                ['id' => 'prj_pay', 'name' => 'Pay', 'receives' => false, 'isDestination' => false],
            ],
        ];
        $this->getJson('/loupe/v1/org')->assertOk()->assertExactJson($expected);
        $this->getJson('/loupe/v1/org')->assertOk()->assertExactJson($expected);

        Http::assertSentCount(1); // the second answer came from the cache
        Http::assertSent(function (Request $r) {
            $ts = $r->header('X-Loupe-Timestamp')[0];

            return $r->method() === 'GET'
                && $r->url() === 'https://hub.test/v1/projects'
                && $r->header('X-Loupe-Project')[0] === 'prj_shop'
                && abs(time() - (int) $ts) < 5
                && hash_equals(hash_hmac('sha256', $ts.'.', self::SECRET), $r->header('X-Loupe-Signature')[0]);
        });
    }

    public function test_without_hub_the_organization_is_null(): void
    {
        Http::fake();
        $this->actingAsAllowed();

        $this->getJson('/loupe/v1/org')->assertOk()->assertExactJson([
            'organization' => null,
            'project' => ['key' => 'app', 'name' => null, 'destination' => null],
            'projects' => [],
        ]);
        Http::assertNothingSent();
    }

    public function test_a_hub_error_is_reported_and_not_cached(): void
    {
        $this->enableHub();
        Http::fake(['hub.test/*' => Http::sequence()->push(['error' => 'invalid signature'], 401)->push($this->hubAnswer())]);

        $this->assertSame('hub_unreachable', Hub::organization()['error']);
        $this->assertNull(Hub::organization()['error'] ?? null);
        Http::assertSentCount(2);
    }

    public function test_a_malformed_answer_or_a_network_error_is_reported(): void
    {
        $this->enableHub();
        Http::fake(['hub.test/*' => Http::response(['organization' => 'nope'])]);
        $this->assertNull(Hub::organization()['organization']);

        Http::fake(fn () => throw new ConnectionException('cURL error 28: timed out'));
        $out = Hub::organization();
        $this->assertNull($out['organization']);
        $this->assertSame('hub_unreachable', $out['error']);
        $this->assertFalse(Cache::has('loupe.hub.org'));
    }

    public function test_it_needs_the_use_ability(): void
    {
        config()->set('loupe.authorize.use', fn () => false);
        $this->actingAs($this->makeUser());

        $this->getJson('/loupe/v1/org')->assertForbidden();
    }
}
