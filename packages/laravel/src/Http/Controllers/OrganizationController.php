<?php

namespace Loupekit\Loupe\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Loupekit\Loupe\Support\Hub;

/**
 * GET /{path}/v1/org — this app's project and its organization's projects, for
 * the widget's Home chip. Always 200: without Hub the organization is null.
 */
class OrganizationController extends Controller
{
    public function __invoke(): JsonResponse
    {
        return response()->json(Hub::organization());
    }
}
