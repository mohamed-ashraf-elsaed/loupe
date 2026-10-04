<?php

namespace Loupekit\Loupe\Support;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;

final class Columns
{
    /**
     * Keep only the attributes the model's table actually has.
     *
     * A package upgrade must never make an app *unable to file feedback*. That is
     * exactly what happened when `pr` landed: the controller wrote a column the host
     * had not migrated yet, so every create raised a QueryException and returned a
     * 500. Dropping unknown attributes degrades instead — the newest fields simply
     * stay empty until `php artisan migrate` runs — and says so in the log.
     *
     * The column list is fetched on every call rather than cached. Caching it in a
     * static looked tempting and is wrong: under Octane or a queue worker the process
     * outlives a migration, so a worker started before `php artisan migrate` would
     * keep writing the old shape until it was restarted. This runs on write paths
     * only, where one metadata query is nothing.
     *
     * @param  array<string, mixed>  $attributes
     * @return array<string, mixed>
     */
    public static function only(Model $model, array $attributes): array
    {
        $table = $model->getTable();
        $columns = array_fill_keys(Schema::getColumnListing($table), true);

        $kept = array_filter($attributes, static fn ($value, $key) => isset($columns[$key]), ARRAY_FILTER_USE_BOTH);
        $missing = array_keys(array_diff_key($attributes, $kept));
        if ($missing) {
            Log::warning(
                '[loupe] '.$table.' is missing '.implode(', ', $missing).
                ' — run `php artisan migrate` to add '.(count($missing) === 1 ? 'it' : 'them').'.'
            );
        }

        return $kept;
    }
}
