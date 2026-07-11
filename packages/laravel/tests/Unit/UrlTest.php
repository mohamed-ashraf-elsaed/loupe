<?php

namespace Loupekit\Loupe\Tests\Unit;

use Loupekit\Loupe\Support\Url;
use PHPUnit\Framework\TestCase;

class UrlTest extends TestCase
{
    public function test_it_keeps_a_plain_path(): void
    {
        $this->assertSame('/checkout', Url::normalize('/checkout'));
    }

    public function test_it_strips_a_single_trailing_slash_but_keeps_root(): void
    {
        $this->assertSame('/checkout', Url::normalize('/checkout/'));
        $this->assertSame('/', Url::normalize('/'));
    }

    public function test_it_drops_utm_and_click_ids_and_dev_params(): void
    {
        $this->assertSame('/p', Url::normalize('/p?utm_source=x&gclid=y&api=z&key=k'));
    }

    public function test_it_sorts_kept_params_by_key_then_value(): void
    {
        $this->assertSame('/p?a=1&b=2', Url::normalize('/p?b=2&a=1'));
        $this->assertSame('/p?a=1&a=2', Url::normalize('/p?a=2&a=1'));
    }

    public function test_it_normalizes_a_full_url_to_path_and_query(): void
    {
        $this->assertSame('/checkout?q=1', Url::normalize('https://shop.test/checkout/?q=1&utm_medium=cpc'));
    }

    public function test_it_handles_protocol_relative_and_bare_relative(): void
    {
        $this->assertSame('/a', Url::normalize('//host.test/a'));
        $this->assertSame('/foo', Url::normalize('foo'));
    }

    public function test_it_encodes_values_form_style(): void
    {
        $this->assertSame('/p?q=a+b', Url::normalize('/p?q=a%20b'));
    }

    public function test_it_keeps_a_param_without_a_value(): void
    {
        $this->assertSame('/p?flag=', Url::normalize('/p?flag'));
    }

    public function test_it_skips_empty_query_segments(): void
    {
        $this->assertSame('/p?a=1', Url::normalize('/p?a=1&'));
        $this->assertSame('/p?a=1&b=2', Url::normalize('/p?a=1&&b=2'));
    }

    public function test_it_falls_back_on_unparseable_input(): void
    {
        // A bare scheme like "http://" makes parse_url fail → fallback trims at "?".
        $this->assertSame('http://', Url::normalize('http://?x=1'));
    }
}
