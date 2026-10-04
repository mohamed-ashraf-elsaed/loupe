<?php

namespace Loupekit\Loupe\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Loupekit\Loupe\Support\People;

/** GET /{path}/v1/people — who can be @mentioned (`MentionCandidate[]`). */
class PeopleController extends Controller
{
    public function __invoke(): JsonResponse
    {
        return response()->json(People::all());
    }
}
